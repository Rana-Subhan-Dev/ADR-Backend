const crypto = require("crypto");
const prisma = require("../config/prisma");
const { runTransaction } = require("../config/prisma");
const docusignRepository = require("../repositories/docusign.repository");
const caseService = require("./case.service");
const docusignClient = require("./docusignClient.service");
const ApiError = require("../utils/apiError");
const {
  putObjectBuffer,
  getSignedDownloadUrl,
} = require("../utils/s3Helper");
const notificationService = require("./notification.service");

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

const formatPersonName = (user) => {
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || null;
};

const PENDING_RECIPIENT_STATUSES = new Set(["SENT", "DELIVERED"]);
const TERMINAL_ENVELOPE_STATUSES = new Set([
  "COMPLETED",
  "DECLINED",
  "FAILED",
  "EXPIRED",
]);

const decorateEnvelope = (envelope, extras = {}) => {
  if (!envelope) return envelope;
  const senderName = formatPersonName(envelope.sentBy);
  const recipients = (envelope.recipients || []).map((recipient) => ({
    ...recipient,
    caseParticipantId:
      recipient.caseParticipantId ||
      recipient.caseParticipant?.id ||
      null,
  }));
  const activity = (envelope.events || []).map((event) => ({
    ...event,
    title: event.message || event.eventType,
    timestamp: event.occurredAt || event.createdAt,
  }));
  const lastEvent = activity[activity.length - 1] || null;

  return {
    ...envelope,
    recipients,
    recipientList: recipients,
    documentName: envelope.sourceDocument?.name || null,
    signedDocumentName: envelope.signedDocument?.name || null,
    canDownloadSigned: Boolean(
      envelope.status === "COMPLETED" && envelope.signedDocumentId,
    ),
    recipientSummary: recipients
      .map((r) => r.name)
      .filter(Boolean)
      .join(", "),
    template: envelope.templateName || null,
    sender: senderName,
    activity,
    lastActivity: lastEvent?.timestamp || envelope.updatedAt || null,
    lastActivityAt: lastEvent?.timestamp || envelope.updatedAt || null,
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

const enrichRecipientsWithParticipants = async (caseId, envelope) => {
  const recipients = envelope.recipients || [];
  const missingEmails = recipients
    .filter((r) => !r.caseParticipantId && r.email)
    .map((r) => r.email.toLowerCase());
  if (!missingEmails.length) return envelope;

  const participants = await prisma.caseParticipant.findMany({
    where: {
      caseId,
      accessStatus: "ACTIVE",
      OR: missingEmails.map((email) => ({
        user: { email: { equals: email, mode: "insensitive" } },
      })),
    },
    select: {
      id: true,
      user: { select: { email: true } },
    },
  });
  const byEmail = new Map(
    participants.map((p) => [p.user.email.toLowerCase(), p.id]),
  );

  return {
    ...envelope,
    recipients: recipients.map((recipient) => {
      if (recipient.caseParticipantId || !recipient.email) return recipient;
      const matched = byEmail.get(recipient.email.toLowerCase());
      return matched
        ? { ...recipient, caseParticipantId: matched }
        : recipient;
    }),
  };
};

const getEnvelope = async (caseId, envelopeRecordId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const envelope = await docusignRepository.findById(envelopeRecordId);
  if (!envelope || envelope.caseId !== caseId)
    throw new ApiError(404, "DocuSign envelope not found.");
  assertCanViewEnvelope(envelope, currentUser);
  const enriched = await enrichRecipientsWithParticipants(caseId, envelope);
  return decorateEnvelope(enriched);
};

const getEnvelopeByExternalId = async (caseId, envelopeId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const envelope = await docusignRepository.findByDocusignEnvelopeId(
    envelopeId,
  );
  if (!envelope || envelope.caseId !== caseId)
    throw new ApiError(404, "DocuSign envelope not found.");
  assertCanViewEnvelope(envelope, currentUser);
  const enriched = await enrichRecipientsWithParticipants(caseId, envelope);
  return decorateEnvelope(enriched);
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

  const documentFileUrl = await getSignedDownloadUrl(
    sourceDocument.currentVersion.fileKey,
    600,
  );

  const resolvedTemplateId =
    typeof data.templateId === "string" && data.templateId.trim()
      ? data.templateId.trim()
      : null;

  const templateRoles = resolvedTemplateId
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
      documentFileUrl,
      documentName: sourceDocument.name || "Agreement.pdf",
      recipients: data.recipients,
      templateId: resolvedTemplateId,
      templateRoles,
    });
  } catch (error) {
    throw error instanceof ApiError
      ? error
      : new ApiError(502, error.message || "Failed to send signature request.");
  }

  const docusignEnvelopeId = dsResult.envelopeId;
  if (!docusignEnvelopeId)
    throw new ApiError(502, "Dropbox Sign did not return a signature request id.");

  const signaturesByEmail = new Map(
    (dsResult.signatures || []).map((signature) => [
      String(signature.signer_email || "").toLowerCase(),
      signature,
    ]),
  );

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
          create: data.recipients.map((recipient, index) => {
            const matched = signaturesByEmail.get(
              String(recipient.email || "").toLowerCase(),
            );
            return {
              name: recipient.name,
              role: recipient.role || null,
              email: recipient.email,
              status: "SENT",
              routingOrder: recipient.routingOrder || index + 1,
              lastActivityAt: new Date(),
              docusignRecipientId: matched?.signature_id || null,
              caseParticipantId: recipient.caseParticipantId || null,
              attorneyId: recipient.attorneyId || null,
              casePartyId: recipient.casePartyId || null,
            };
          }),
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

    await notificationService.notifyCaseManagers(
      caseId,
      {
        eventType: "DOCUSIGN_SENT",
        subject: `DocuSign sent: ${sourceDocument.name}`,
        relatedRecordType: "DocuSignEnvelope",
        relatedRecordId: envelope.id,
        templateData: {
          title: "DocuSign envelope sent",
          message: `${sourceDocument.name} was sent for signature.`,
          kind: "DOCUSIGN_SENT",
          caseId,
          href: `/case-manager/docusign/${envelope.id}`,
        },
      },
      { excludeUserId: currentUser.id, tx },
    );

    return decorateEnvelope(await docusignRepository.findById(envelope.id, tx));
  });
};

const remindEnvelope = async (caseId, envelopeRecordId, currentUser) => {
  const envelope = await getEnvelope(caseId, envelopeRecordId, currentUser);
  assertCanManage(currentUser);
  if (TERMINAL_ENVELOPE_STATUSES.has(envelope.status))
    throw new ApiError(
      400,
      "Reminders cannot be sent for completed, declined, failed, or expired envelopes.",
    );
  if (envelope.status !== "SENT" && envelope.status !== "PENDING")
    throw new ApiError(
      400,
      "Reminders can only be sent for envelopes that are still in progress.",
    );
  const pending = (envelope.recipients || []).filter((r) =>
    PENDING_RECIPIENT_STATUSES.has(r.status),
  );
  if (!pending.length)
    throw new ApiError(400, "No pending recipients to remind.");
  if (!envelope.envelopeId)
    throw new ApiError(400, "Envelope has no Dropbox Sign signature request id.");

  for (const recipient of pending) {
    if (!recipient.email) continue;
    await docusignClient.sendEnvelopeReminder(envelope.envelopeId, {
      email: recipient.email,
      name: recipient.name,
    });
  }

  return runTransaction(async (tx) => {
    const updated = await docusignRepository.update(
      envelopeRecordId,
      { lastReminderSentAt: new Date() },
      tx,
    );
    const message = `Reminder sent to ${pending.length} recipient(s).`;
    await addEvent(
      tx,
      envelope.id,
      "REMINDER_SENT",
      message,
      currentUser.email,
    );
    await writeTimeline(
      tx,
      envelope,
      currentUser,
      "DOCUSIGN_SENT",
      `DocuSign Reminder Sent: ${message}`,
      null,
      { action: "REMINDER_SENT", pendingCount: pending.length },
    );
    await writeAudit(tx, currentUser, "EDIT", updated, null, {
      action: "REMINDER_SENT",
    });
    return decorateEnvelope(await docusignRepository.findById(envelope.id, tx));
  });
};

const retryEnvelope = async (caseId, envelopeRecordId, currentUser) => {
  const envelope = await getEnvelope(caseId, envelopeRecordId, currentUser);
  assertCanManage(currentUser);
  if (!["DECLINED", "FAILED"].includes(envelope.status)) {
    throw new ApiError(
      400,
      "Retry is only available for declined or failed envelopes.",
    );
  }
  if (!envelope.sourceDocumentId) {
    throw new ApiError(400, "Original source document is missing.");
  }
  const recipients = (envelope.recipients || []).map((recipient, index) => ({
    name: recipient.name,
    role: recipient.role || null,
    email: recipient.email,
    routingOrder: recipient.routingOrder || index + 1,
    caseParticipantId: recipient.caseParticipantId || null,
    attorneyId: recipient.attorneyId || null,
    casePartyId: recipient.casePartyId || null,
  }));
  if (!recipients.length) {
    throw new ApiError(400, "Original envelope has no recipients to retry.");
  }

  const retried = await sendEnvelope(
    caseId,
    {
      sourceDocumentId: envelope.sourceDocumentId,
      templateId: envelope.templateId || null,
      templateName: envelope.templateName || null,
      emailSubject: `Retry: Please sign ${envelope.documentName || "Agreement"}`,
      dueDate: envelope.dueDate || null,
      recipients,
    },
    currentUser,
  );

  await runTransaction(async (tx) => {
    await addEvent(
      tx,
      envelope.id,
      "ENVELOPE_RETRY",
      `Retry created as envelope ${retried.id}.`,
      currentUser.email,
      { retriedEnvelopeId: retried.id },
    );
    await writeTimeline(
      tx,
      envelope,
      currentUser,
      "DOCUSIGN_SENT",
      `DocuSign envelope retried (new envelope ${retried.id}).`,
      { status: envelope.status },
      { retriedEnvelopeId: retried.id },
    );
  });

  return {
    previousEnvelopeId: envelope.id,
    envelope: retried,
  };
};

const finalizeSignedPdfFromProvider = async (envelope) => {
  if (!envelope?.envelopeId) {
    throw new ApiError(400, "Envelope has no Dropbox Sign signature request id.");
  }
  if (envelope.signedDocumentId) return envelope;

  const pdfBuffer = await docusignClient.downloadCombinedPdf(envelope.envelopeId);
  const signedDocumentId = await storeSignedPdf(
    envelope,
    pdfBuffer,
    envelope.sentByUserId,
  );

  await runTransaction(async (tx) => {
    await docusignRepository.update(
      envelope.id,
      {
        signedDocumentId,
        status: "COMPLETED",
        completedAt: envelope.completedAt || new Date(),
        failureMessage: null,
      },
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
    await notificationService.notifyCaseManagers(
      envelope.caseId,
      {
        eventType: "DOCUSIGN_COMPLETED",
        subject: "DocuSign envelope completed",
        relatedRecordType: "DocuSignEnvelope",
        relatedRecordId: envelope.id,
        templateData: {
          title: "DocuSign completed",
          message: "All recipients have signed the envelope.",
          kind: "DOCUSIGN_COMPLETED",
          caseId: envelope.caseId,
          href: `/case-manager/docusign/${envelope.id}`,
        },
      },
      { tx },
    );
    if (envelope.sentByUserId) {
      await notificationService.createInAppNotification(
        {
          recipientUserId: envelope.sentByUserId,
          eventType: "DOCUSIGN_COMPLETED",
          subject: "DocuSign envelope completed",
          relatedRecordType: "DocuSignEnvelope",
          relatedRecordId: envelope.id,
          templateData: {
            title: "DocuSign completed",
            message: "All recipients have signed the envelope.",
            kind: "DOCUSIGN_COMPLETED",
            caseId: envelope.caseId,
            href: `/case-manager/docusign/${envelope.id}`,
          },
        },
        tx,
      );
    }
  });

  return docusignRepository.findById(envelope.id);
};

const getSignedPdfDownload = async (
  caseId,
  envelopeRecordId,
  currentUser,
) => {
  let envelope = await getEnvelope(caseId, envelopeRecordId, currentUser);

  // Recover when webhook marked COMPLETED but document create previously failed.
  if (
    envelope.status === "COMPLETED" &&
    !envelope.signedDocument?.currentVersion &&
    envelope.envelopeId
  ) {
    envelope = decorateEnvelope(await finalizeSignedPdfFromProvider(envelope));
  }

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
    throw new ApiError(400, "Envelope has no Dropbox Sign signature request id.");

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
    envelope.recipients.find((row) => row.docusignRecipientId || row.email) ||
    null;
  if (!target?.email)
    throw new ApiError(400, "No recipient email available for signing view.");
  if (!target.docusignRecipientId)
    throw new ApiError(
      400,
      "Recipient has no Dropbox Sign signature id. Re-send the envelope.",
    );

  const view = await docusignClient.createRecipientView(envelope.envelopeId, {
    email: target.email,
    userName: target.name,
    signatureId: target.docusignRecipientId,
    returnUrl,
  });

  const port = process.env.PORT || 8000;
  const publicBase =
    process.env.API_PUBLIC_URL || `http://localhost:${port}`;
  const embedTestUrl = `${publicBase}/docusign-embed-test?clientId=${encodeURIComponent(
    view.clientId,
  )}&signUrl=${encodeURIComponent(view.url)}`;

  return {
    envelopeId: envelope.id,
    signingUrl: view.url,
    recipientEmail: target.email,
    clientId: view.clientId,
    // Open this in a browser for local/test signing (skipDomainVerification).
    // Do not open signingUrl directly — API App domain is fedarb.com.
    embedTestUrl,
  };
};

const mapDsEnvelopeStatus = (statusOrEvent) => {
  const normalized = String(statusOrEvent || "").toLowerCase();
  if (
    normalized === "completed" ||
    normalized === "signature_request_all_signed" ||
    normalized === "signature_request_downloadable"
  )
    return "COMPLETED";
  if (
    normalized === "declined" ||
    normalized === "signature_request_declined"
  )
    return "DECLINED";
  if (
    normalized === "voided" ||
    normalized === "deleted" ||
    normalized === "signature_request_canceled" ||
    normalized === "signature_request_invalid" ||
    normalized === "file_error" ||
    normalized.includes("fail") ||
    normalized.includes("error")
  )
    return "FAILED";
  if (
    normalized === "sent" ||
    normalized === "delivered" ||
    normalized === "signature_request_sent" ||
    normalized === "signature_request_viewed" ||
    normalized === "signature_request_signed" ||
    normalized === "signature_request_email_bounce" ||
    normalized === "awaiting_signature"
  )
    return "SENT";
  return null;
};

const mapDsRecipientStatus = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed" || normalized === "success")
    return "COMPLETED";
  if (normalized === "signed") return "SIGNED";
  if (
    normalized === "delivered" ||
    normalized === "signature_request_viewed" ||
    normalized === "viewed"
  )
    return "DELIVERED";
  if (normalized === "declined") return "DECLINED";
  if (
    normalized.includes("fail") ||
    normalized.includes("error") ||
    normalized === "autoresponded"
  )
    return "FAILED";
  if (
    normalized === "sent" ||
    normalized === "created" ||
    normalized === "awaiting_signature"
  )
    return "SENT";
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
        description: `Signed copy of signature request ${envelope.envelopeId}`,
        visibility: "INTERNAL_ONLY",
        reviewStatus: "REVIEWED",
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

const handleWebhook = async (payload) => {
  if (!docusignClient.verifyWebhookHmac(payload)) {
    throw new ApiError(401, "Invalid Dropbox Sign webhook signature.");
  }

  const eventType = payload?.event?.event_type || null;
  const signatureRequest = payload?.signature_request || null;
  const dsEnvelopeId =
    signatureRequest?.signature_request_id ||
    payload?.data?.envelopeId ||
    payload?.envelopeId ||
    null;
  if (!dsEnvelopeId) return { ignored: true, reason: "missing_envelope_id" };

  const envelope = await docusignRepository.findByDocusignEnvelopeId(
    dsEnvelopeId,
  );
  if (!envelope) return { ignored: true, reason: "unknown_envelope" };

  const eventName = eventType || payload?.event || "unknown";
  let mappedStatus = mapDsEnvelopeStatus(eventType);

  if (!mappedStatus && signatureRequest) {
    if (signatureRequest.is_complete) mappedStatus = "COMPLETED";
    else if (signatureRequest.is_declined) mappedStatus = "DECLINED";
    else if (signatureRequest.has_error) mappedStatus = "FAILED";
  }

  const recipientsPayload = signatureRequest?.signatures || [];
  const recipientRows = Array.isArray(recipientsPayload)
    ? recipientsPayload
    : [recipientsPayload].filter(Boolean);

  let failureMessage = envelope.failureMessage;
  for (const row of recipientRows) {
    const status = String(row.status_code || row.status || "").toLowerCase();
    if (status.includes("error") || status.includes("fail")) {
      failureMessage =
        row.error_msg ||
        row.message ||
        `Delivery failed for ${row.signer_email_address || row.email || "recipient"}.`;
    }
    if (status === "declined") {
      failureMessage = `Declined by ${
        row.signer_name ||
        row.signer_email_address ||
        row.email ||
        "recipient"
      }`;
    }
  }
  if (eventType === "signature_request_declined") {
    failureMessage = failureMessage || "Signature request declined.";
  }
  if (
    eventType === "signature_request_canceled" ||
    eventType === "signature_request_invalid" ||
    eventType === "file_error"
  ) {
    failureMessage =
      failureMessage || `Dropbox Sign event: ${eventType}`;
  }

  // Intermediate signed events keep envelope SENT until all signers finish.
  if (eventType === "signature_request_signed" && !signatureRequest?.is_complete) {
    mappedStatus = "SENT";
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
      `Dropbox Sign event: ${eventName}`,
      null,
      payload,
    );

    for (const row of recipientRows) {
      const email = (
        row.signer_email_address ||
        row.email ||
        ""
      ).toLowerCase();
      const signatureId = row.signature_id || null;
      const local = envelope.recipients.find((r) => {
        if (email && (r.email || "").toLowerCase() === email) return true;
        if (
          signatureId &&
          r.docusignRecipientId &&
          r.docusignRecipientId === signatureId
        )
          return true;
        return false;
      });
      if (!local) continue;

      let recipientStatus = mapDsRecipientStatus(row.status_code || row.status);
      if (
        eventType === "signature_request_signed" &&
        payload?.event?.event_metadata?.related_signature_id ===
          local.docusignRecipientId
      ) {
        recipientStatus = "SIGNED";
      }
      if (eventType === "signature_request_viewed") {
        recipientStatus = "DELIVERED";
      }

      await docusignRepository.updateRecipient(
        local.id,
        {
          status: recipientStatus,
          lastActivityAt: new Date(),
          docusignRecipientId:
            signatureId || local.docusignRecipientId || null,
        },
        tx,
      );
    }
  });

  const shouldStoreSignedPdf =
    (mappedStatus === "COMPLETED" ||
      eventType === "signature_request_all_signed" ||
      eventType === "signature_request_downloadable") &&
    !envelope.signedDocumentId;

  if (shouldStoreSignedPdf) {
    try {
      await finalizeSignedPdfFromProvider(envelope);
    } catch (error) {
      await docusignRepository.update(envelope.id, {
        failureMessage:
          error.message ||
          "Failed to download signed PDF from Dropbox Sign.",
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
  getEnvelopeByExternalId,
  remindEnvelope,
  retryEnvelope,
  getSignedPdfDownload,
  getSourcePdfDownload,
  getRecipientSigningUrl,
  handleWebhook,
};
