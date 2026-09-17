const crypto = require("crypto");
const prisma = require("../config/prisma");
const { runTransaction } = require("../config/prisma");
const docusignRepository = require("../repositories/docusign.repository");
const caseService = require("./case.service");
const docusignClient = require("./docusignClient.service");
const ApiError = require("../utils/apiError");
const {
  getObjectBuffer,
  putObjectBuffer,
  getSignedDownloadUrl,
} = require("../utils/s3Helper");

const managerRoles = ["SUPER_ADMIN", "ADMIN_LEADERSHIP", "CASE_MANAGER"];
const isManager = (user) => managerRoles.includes(user.role?.name);

const assertCanManage = (user) => {
  if (!isManager(user))
    throw new ApiError(
      403,
      "You do not have permission to manage DocuSign envelopes.",
    );
};

const paginate = (envelopes, total, page, limit) => ({
  envelopes,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1,
  },
});

const decorateEnvelope = (envelope, extras = {}) => {
  if (!envelope) return envelope;
  return {
    ...envelope,
    documentName: envelope.sourceDocument?.name || null,
    signedDocumentName: envelope.signedDocument?.name || null,
    canDownloadSigned: Boolean(
      envelope.status === "COMPLETED" && envelope.signedDocumentId,
    ),
    recipientSummary: (envelope.recipients || [])
      .map((r) => r.name)
      .filter(Boolean)
      .join(", "),
    ...extras,
  };
};

const userIsRecipient = (envelope, currentUser) => {
  const email = (currentUser.email || "").toLowerCase();
  return (envelope.recipients || []).some((recipient) => {
    if (recipient.email && recipient.email.toLowerCase() === email) return true;
    if (recipient.caseParticipant?.user?.id === currentUser.id) return true;
    if (
      recipient.caseParticipant?.user?.email &&
      recipient.caseParticipant.user.email.toLowerCase() === email
    )
      return true;
    return false;
  });
};

const assertCanViewEnvelope = (envelope, currentUser) => {
  if (isManager(currentUser)) return;
  if (userIsRecipient(envelope, currentUser)) return;
  throw new ApiError(403, "You do not have access to this DocuSign envelope.");
};

const writeAudit = (
  tx,
  currentUser,
  action,
  envelope,
  previousValue,
  newValue,
) =>
  tx.auditLog.create({
    data: {
      actingUserId: currentUser?.id || null,
      actingUserRoleSnapshot: currentUser?.role?.name || null,
      action,
      module: "DOCUSIGN",
      affectedRecordType: "DocuSignEnvelope",
      affectedRecordId: envelope.id,
      previousValue,
      newValue,
    },
  });

const writeTimeline = (
  tx,
  envelope,
  currentUser,
  eventType,
  summary,
  previousValue,
  newValue,
) =>
  tx.caseTimelineEvent.create({
    data: {
      caseId: envelope.caseId,
      eventType,
      relatedRecordType: "DocuSignEnvelope",
      relatedRecordId: envelope.id,
      summary,
      actorUserId: currentUser?.id || null,
      previousValue: previousValue ? JSON.stringify(previousValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
    },
  });

const addEvent = (tx, envelopeId, eventType, message, actorEmail, rawPayload) =>
  docusignRepository.createEvent(
    {
      envelopeId,
      eventType,
      message: message || null,
      actorEmail: actorEmail || null,
      rawPayload: rawPayload || undefined,
      occurredAt: new Date(),
    },
    tx,
  );

const assertSourceDocument = async (caseId, sourceDocumentId, tx = prisma) => {
  const document = await tx.document.findFirst({
    where: { id: sourceDocumentId, caseId, deletedAt: null },
    select: {
      id: true,
      name: true,
      currentVersion: { select: { fileKey: true, mimeType: true } },
    },
  });
  if (!document?.currentVersion?.fileKey)
    throw new ApiError(400, "Source document not found for this case.");
  return document;
};

const assertRecipients = async (caseId, recipients, tx = prisma) => {
  for (const recipient of recipients) {
    if (!recipient.email)
      throw new ApiError(400, "Each recipient must include an email.");
    const linkedCount = [
      recipient.caseParticipantId,
      recipient.attorneyId,
      recipient.casePartyId,
    ].filter(Boolean).length;
    if (linkedCount > 1)
      throw new ApiError(
        400,
        "A recipient can reference only one case record.",
      );
    if (recipient.caseParticipantId) {
      const participant = await tx.caseParticipant.findFirst({
        where: {
          id: recipient.caseParticipantId,
          caseId,
          accessStatus: "ACTIVE",
        },
        select: { id: true },
      });
      if (!participant)
        throw new ApiError(
          400,
          "Recipient participant does not belong to this case.",
        );
    }
    if (recipient.casePartyId) {
      const party = await tx.caseParty.findFirst({
        where: { id: recipient.casePartyId, caseId },
        select: { id: true },
      });
      if (!party)
        throw new ApiError(
          400,
          "Recipient party does not belong to this case.",
        );
    }
    if (recipient.attorneyId) {
      const representation = await tx.partyAttorneyRepresentation.findFirst({
        where: { attorneyId: recipient.attorneyId, caseParty: { caseId } },
        select: { id: true },
      });
      if (!representation)
        throw new ApiError(
          400,
          "Recipient attorney is not linked to this case.",
        );
    }
  }
};

const getEnvelope = async (caseId, envelopeRecordId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const envelope = await docusignRepository.findById(envelopeRecordId);
  if (!envelope || envelope.caseId !== caseId)
    throw new ApiError(404, "DocuSign envelope not found.");
  assertCanViewEnvelope(envelope, currentUser);
  return decorateEnvelope(envelope);
};

const getEnvelopes = async (caseId, query, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;

  const where = {
    caseId,
    ...(query.status && { status: query.status }),
  };

  if (!isManager(currentUser) || query.mine) {
    const email = (currentUser.email || "").toLowerCase();
    where.OR = [
      { recipients: { some: { email: { equals: email, mode: "insensitive" } } } },
      {
        recipients: {
          some: { caseParticipant: { userId: currentUser.id } },
        },
      },
    ];
  }

  const [envelopes, total] = await docusignRepository.getMany({
    where,
    skip: (page - 1) * limit,
    take: limit,
  });
  return paginate(envelopes.map((row) => decorateEnvelope(row)), total, page, limit);
};

const listTemplates = async (caseId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  assertCanManage(currentUser);
  return docusignClient.listTemplates();
};

const sendEnvelope = async (caseId, data, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  assertCanManage(currentUser);
  await assertRecipients(caseId, data.recipients);
  const sourceDocument = await assertSourceDocument(
    caseId,
    data.sourceDocumentId,
  );

  const pdfBuffer = await getObjectBuffer(sourceDocument.currentVersion.fileKey);
  const documentBase64 = pdfBuffer.toString("base64");

  const templateRoles = data.templateId
    ? data.recipients.map((recipient, index) => ({
        roleName: recipient.role || `Signer ${index + 1}`,
        name: recipient.name,
        email: recipient.email,
        routingOrder: recipient.routingOrder || index + 1,
      }))
    : null;

  let dsResult;
  try {
    dsResult = await docusignClient.createAndSendEnvelopeFromDocument({
      emailSubject:
        data.emailSubject ||
        `Please sign: ${sourceDocument.name || "Agreement"}`,
      documentBase64,
      documentName: sourceDocument.name || "Agreement.pdf",
      recipients: data.recipients,
      templateId: data.templateId || null,
      templateRoles,
    });
  } catch (error) {
    throw error instanceof ApiError
      ? error
      : new ApiError(502, error.message || "Failed to send DocuSign envelope.");
  }

  const docusignEnvelopeId = dsResult.envelopeId;
  if (!docusignEnvelopeId)
    throw new ApiError(502, "DocuSign did not return an envelope id.");

  return runTransaction(async (tx) => {
    const envelope = await docusignRepository.create(
      {
        caseId,
        envelopeId: docusignEnvelopeId,
        templateId: data.templateId || null,
        templateName: data.templateName || null,
        status: "SENT",
        sentAt: new Date(),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        sourceDocumentId: data.sourceDocumentId,
        sentByUserId: currentUser.id,
        recipients: {
          create: data.recipients.map((recipient, index) => ({
            name: recipient.name,
            role: recipient.role || null,
            email: recipient.email,
            status: "SENT",
            routingOrder: recipient.routingOrder || index + 1,
            lastActivityAt: new Date(),
            caseParticipantId: recipient.caseParticipantId || null,
            attorneyId: recipient.attorneyId || null,
            casePartyId: recipient.casePartyId || null,
          })),
        },
      },
      tx,
    );

    await addEvent(
      tx,
      envelope.id,
      "ENVELOPE_CREATED",
      "Envelope created.",
      currentUser.email,
    );
    await addEvent(
      tx,
      envelope.id,
      "ENVELOPE_SENT",
      "Envelope sent to recipients.",
      currentUser.email,
    );
    await writeTimeline(
      tx,
      envelope,
      currentUser,
      "DOCUSIGN_SENT",
      `DocuSign envelope sent for ${sourceDocument.name}.`,
      null,
      { envelopeId: docusignEnvelopeId, status: "SENT" },
    );
    await writeAudit(tx, currentUser, "CREATE", envelope, null, {
      envelopeId: docusignEnvelopeId,
      status: "SENT",
      recipientCount: data.recipients.length,
    });
    await tx.integrationSyncLog.create({
      data: {
        integrationType: "DOCUSIGN",
        relatedRecordType: "DocuSignEnvelope",
        relatedRecordId: envelope.id,
        status: "SUCCESS",
        lastAttemptAt: new Date(),
        attemptCount: 1,
      },
    });

    return decorateEnvelope(await docusignRepository.findById(envelope.id, tx));
  });
};

const remindEnvelope = async (caseId, envelopeRecordId, currentUser) => {
  const envelope = await getEnvelope(caseId, envelopeRecordId, currentUser);
  assertCanManage(currentUser);
  if (envelope.status !== "SENT")
    throw new ApiError(
      400,
      "Reminders can only be sent for envelopes in SENT status.",
    );
  if (!envelope.envelopeId)
    throw new ApiError(400, "Envelope has no DocuSign envelope id.");

  await docusignClient.sendEnvelopeReminder(envelope.envelopeId);

  return runTransaction(async (tx) => {
    const updated = await docusignRepository.update(
      envelopeRecordId,
      { lastReminderSentAt: new Date() },
      tx,
    );
    await addEvent(
      tx,
      envelope.id,
      "REMINDER_SENT",
      "Reminder sent to recipients.",
      currentUser.email,
    );
    await writeAudit(tx, currentUser, "EDIT", updated, null, {
      action: "REMINDER_SENT",
    });
    return decorateEnvelope(await docusignRepository.findById(envelope.id, tx));
  });
};

const getSignedPdfDownload = async (
  caseId,
  envelopeRecordId,
  currentUser,
) => {
  const envelope = await getEnvelope(caseId, envelopeRecordId, currentUser);
  if (envelope.status !== "COMPLETED" || !envelope.signedDocument?.currentVersion)
    throw new ApiError(400, "Signed PDF is not available yet.");

  const downloadUrl = await getSignedDownloadUrl(
    envelope.signedDocument.currentVersion.fileKey,
    300,
  );
  return {
    envelopeId: envelope.id,
    documentId: envelope.signedDocumentId,
    documentName: envelope.signedDocument.name,
    downloadUrl,
    expiresInSeconds: 300,
  };
};

const getSourcePdfDownload = async (
  caseId,
  envelopeRecordId,
  currentUser,
) => {
  const envelope = await getEnvelope(caseId, envelopeRecordId, currentUser);
  if (!envelope.sourceDocument?.currentVersion)
    throw new ApiError(400, "Source document is not available.");
  const downloadUrl = await getSignedDownloadUrl(
    envelope.sourceDocument.currentVersion.fileKey,
    300,
  );
  return {
    envelopeId: envelope.id,
    documentId: envelope.sourceDocumentId,
    documentName: envelope.sourceDocument.name,
    downloadUrl,
    expiresInSeconds: 300,
  };
};

const getRecipientSigningUrl = async (
  caseId,
  envelopeRecordId,
  currentUser,
  returnUrl,
) => {
  const envelope = await getEnvelope(caseId, envelopeRecordId, currentUser);
  if (!["SENT", "PENDING"].includes(envelope.status))
    throw new ApiError(
      400,
      "Signing is only available while the envelope is awaiting signatures.",
    );
  if (!envelope.envelopeId)
    throw new ApiError(400, "Envelope has no DocuSign envelope id.");

  const email = (currentUser.email || "").toLowerCase();
  const recipient = (envelope.recipients || []).find(
    (row) =>
      (row.email && row.email.toLowerCase() === email) ||
      row.caseParticipant?.user?.id === currentUser.id,
  );

  if (!recipient && !isManager(currentUser))
    throw new ApiError(403, "You are not a recipient on this envelope.");

  const target =
    recipient ||
    envelope.recipients.find((row) => row.email) ||
    null;
  if (!target?.email)
    throw new ApiError(400, "No recipient email available for signing view.");

  const view = await docusignClient.createRecipientView(envelope.envelopeId, {
    email: target.email,
    userName: target.name,
    clientUserId: target.email,
    returnUrl,
  });

  return {
    envelopeId: envelope.id,
    signingUrl: view.url,
    recipientEmail: target.email,
  };
};

const mapDsEnvelopeStatus = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed") return "COMPLETED";
  if (normalized === "declined") return "DECLINED";
  if (normalized === "voided" || normalized === "deleted") return "FAILED";
  if (normalized === "sent" || normalized === "delivered") return "SENT";
  if (normalized.includes("fail")) return "FAILED";
  return null;
};

const mapDsRecipientStatus = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed" || normalized === "signed") return "COMPLETED";
  if (normalized === "declined") return "DECLINED";
  return "SENT";
};

const storeSignedPdf = async (envelope, pdfBuffer, actorUserId) => {
  const uploaderId = actorUserId || envelope.sentByUserId;
  if (!uploaderId) {
    throw new ApiError(
      500,
      "Cannot store signed PDF without an uploading user.",
    );
  }
  const fileKey = `documents/${envelope.caseId}/${Date.now()}-${crypto.randomUUID()}-signed.pdf`;
  await putObjectBuffer({
    key: fileKey,
    body: pdfBuffer,
    contentType: "application/pdf",
  });

  return runTransaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        caseId: envelope.caseId,
        name: `Signed — ${envelope.sourceDocument?.name || "Agreement.pdf"}`,
        description: `Signed copy of DocuSign envelope ${envelope.envelopeId}`,
        visibility: "INTERNAL_ONLY",
        reviewStatus: "APPROVED",
        processingStatus: "COMPLETED",
        uploadedByUserId: uploaderId,
      },
    });
    const version = await tx.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: 1,
        fileKey,
        fileSizeBytes: pdfBuffer.length,
        mimeType: "application/pdf",
        uploadedByUserId: uploaderId,
      },
    });
    await tx.document.update({
      where: { id: document.id },
      data: { currentVersionId: version.id },
    });
    return document.id;
  });
};

const handleWebhook = async (payload, rawBody, signatureHeader) => {
  if (
    process.env.DOCUSIGN_WEBHOOK_HMAC_SECRET &&
    !docusignClient.verifyWebhookHmac(rawBody, signatureHeader)
  ) {
    throw new ApiError(401, "Invalid DocuSign webhook signature.");
  }

  const dsEnvelopeId =
    payload?.data?.envelopeId ||
    payload?.envelopeId ||
    payload?.EnvelopeStatus?.EnvelopeID ||
    null;
  if (!dsEnvelopeId) return { ignored: true, reason: "missing_envelope_id" };

  const envelope = await docusignRepository.findByDocusignEnvelopeId(
    dsEnvelopeId,
  );
  if (!envelope) return { ignored: true, reason: "unknown_envelope" };

  const eventName =
    payload?.event ||
    payload?.EnvelopeStatus?.Status ||
    payload?.status ||
    "unknown";
  const dsStatus =
    payload?.data?.envelopeSummary?.status ||
    payload?.EnvelopeStatus?.Status ||
    payload?.status;
  const mappedStatus = mapDsEnvelopeStatus(dsStatus);

  const recipientsPayload =
    payload?.data?.envelopeSummary?.recipients?.signers ||
    payload?.EnvelopeStatus?.RecipientStatuses?.RecipientStatus ||
    [];
  const recipientRows = Array.isArray(recipientsPayload)
    ? recipientsPayload
    : [recipientsPayload].filter(Boolean);

  let failureMessage = envelope.failureMessage;
  for (const row of recipientRows) {
    const status = String(row.status || row.Status || "").toLowerCase();
    if (status === "autoresponded" || status === "failed") {
      failureMessage =
        row.autoRespondedReason ||
        row.DeclineReason ||
        row.message ||
        `Delivery failed for ${row.email || row.Email || "recipient"}.`;
    }
    if (status === "declined") {
      failureMessage = `Declined by ${row.name || row.UserName || row.email || "recipient"}`;
    }
  }

  await runTransaction(async (tx) => {
    const updateData = {
      ...(mappedStatus && { status: mappedStatus }),
      ...(failureMessage !== undefined && { failureMessage }),
      ...(mappedStatus === "COMPLETED" &&
        !envelope.completedAt && { completedAt: new Date() }),
    };
    await docusignRepository.update(envelope.id, updateData, tx);
    await addEvent(
      tx,
      envelope.id,
      String(eventName).toUpperCase(),
      `DocuSign event: ${eventName}`,
      null,
      payload,
    );

    for (const row of recipientRows) {
      const email = (row.email || row.Email || "").toLowerCase();
      if (!email) continue;
      const local = envelope.recipients.find(
        (r) => (r.email || "").toLowerCase() === email,
      );
      if (!local) continue;
      await docusignRepository.updateRecipient(
        local.id,
        {
          status: mapDsRecipientStatus(row.status || row.Status),
          lastActivityAt: new Date(),
          docusignRecipientId: String(
            row.recipientId || row.RecipientId || local.docusignRecipientId || "",
          ) || null,
        },
        tx,
      );
    }
  });

  if (mappedStatus === "COMPLETED" && !envelope.signedDocumentId) {
    try {
      const pdfBuffer = await docusignClient.downloadCombinedPdf(dsEnvelopeId);
      const signedDocumentId = await storeSignedPdf(
        envelope,
        pdfBuffer,
        envelope.sentByUserId,
      );
      await runTransaction(async (tx) => {
        await docusignRepository.update(
          envelope.id,
          { signedDocumentId, status: "COMPLETED", completedAt: new Date() },
          tx,
        );
        await addEvent(
          tx,
          envelope.id,
          "SIGNED_PDF_STORED",
          "Signed PDF downloaded and stored.",
        );
        await writeTimeline(
          tx,
          envelope,
          { id: envelope.sentByUserId },
          "DOCUSIGN_COMPLETED",
          "DocuSign envelope completed.",
          { status: envelope.status },
          { status: "COMPLETED", signedDocumentId },
        );
      });
    } catch (error) {
      await docusignRepository.update(envelope.id, {
        failureMessage:
          error.message || "Failed to download signed PDF from DocuSign.",
      });
    }
  }

  return { ok: true, envelopeRecordId: envelope.id, status: mappedStatus };
};

module.exports = {
  listTemplates,
  sendEnvelope,
  getEnvelopes,
  getEnvelope,
  remindEnvelope,
  getSignedPdfDownload,
  getSourcePdfDownload,
  getRecipientSigningUrl,
  handleWebhook,
};
