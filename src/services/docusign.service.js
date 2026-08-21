const prisma = require("../config/prisma");
const docusignRepository = require("../repositories/docusign.repository");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");

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

const getEnvelope = async (caseId, envelopeRecordId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  assertCanManage(currentUser);
  const envelope = await docusignRepository.findById(envelopeRecordId);
  if (!envelope || envelope.caseId !== caseId)
    throw new ApiError(404, "DocuSign envelope not found.");
  return envelope;
};

const assertSignedDocument = async (caseId, signedDocumentId, tx) => {
  if (!signedDocumentId) return;
  const document = await tx.document.findFirst({
    where: { id: signedDocumentId, caseId, deletedAt: null },
    select: { id: true },
  });
  if (!document)
    throw new ApiError(400, "Signed document does not belong to this case.");
};

const assertRecipients = async (caseId, recipients, tx) => {
  for (const recipient of recipients) {
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
      actingUserId: currentUser.id,
      actingUserRoleSnapshot: currentUser.role?.name || null,
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
      actorUserId: currentUser.id,
      previousValue: previousValue ? JSON.stringify(previousValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
    },
  });

const createEnvelope = async (caseId, data, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  assertCanManage(currentUser);
  return prisma.$transaction(async (tx) => {
    await assertSignedDocument(caseId, data.signedDocumentId, tx);
    await assertRecipients(caseId, data.recipients, tx);
    const envelope = await docusignRepository.create(
      {
        caseId,
        envelopeId: data.envelopeId,
        templateId: data.templateId || null,
        signedDocumentId: data.signedDocumentId || null,
        recipients: { create: data.recipients },
      },
      tx,
    );
    await writeAudit(tx, currentUser, "CREATE", envelope, null, {
      envelopeId: envelope.envelopeId,
      recipientCount: envelope.recipients.length,
    });
    return envelope;
  });
};

const getEnvelopes = async (caseId, query, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  assertCanManage(currentUser);
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const [envelopes, total] = await docusignRepository.getMany({
    where: { caseId, ...(query.status && { status: query.status }) },
    skip: (page - 1) * limit,
    take: limit,
  });
  return paginate(envelopes, total, page, limit);
};

const updateEnvelope = async (caseId, envelopeRecordId, data, currentUser) => {
  const envelope = await getEnvelope(caseId, envelopeRecordId, currentUser);
  if (envelope.status !== "PENDING")
    throw new ApiError(400, "Only pending DocuSign envelopes can be updated.");
  return prisma.$transaction(async (tx) => {
    await assertSignedDocument(caseId, data.signedDocumentId, tx);
    if (data.recipients) await assertRecipients(caseId, data.recipients, tx);
    const updated = await docusignRepository.update(
      envelopeRecordId,
      {
        ...(data.templateId !== undefined && {
          templateId: data.templateId || null,
        }),
        ...(data.signedDocumentId !== undefined && {
          signedDocumentId: data.signedDocumentId || null,
        }),
        ...(data.recipients && {
          recipients: { deleteMany: {}, create: data.recipients },
        }),
      },
      tx,
    );
    await writeAudit(
      tx,
      currentUser,
      "EDIT",
      updated,
      {
        templateId: envelope.templateId,
        signedDocumentId: envelope.signedDocumentId,
        recipientCount: envelope.recipients.length,
      },
      {
        templateId: updated.templateId,
        signedDocumentId: updated.signedDocumentId,
        recipientCount: updated.recipients.length,
      },
    );
    return updated;
  });
};

const queueIntegration = async (
  caseId,
  envelopeRecordId,
  currentUser,
  reminder,
) => {
  const envelope = await getEnvelope(caseId, envelopeRecordId, currentUser);
  if (!reminder && envelope.status !== "PENDING")
    throw new ApiError(400, "Only pending DocuSign envelopes can be sent.");
  if (reminder && envelope.status !== "SENT")
    throw new ApiError(
      400,
      "Reminders can only be sent for sent DocuSign envelopes.",
    );
  return prisma.$transaction(async (tx) => {
    const updated = reminder
      ? await docusignRepository.update(
          envelopeRecordId,
          { lastReminderSentAt: new Date() },
          tx,
        )
      : envelope;
    await tx.integrationSyncLog.create({
      data: {
        integrationType: "DOCUSIGN",
        relatedRecordType: reminder ? "DocuSignReminder" : "DocuSignEnvelope",
        relatedRecordId: envelope.id,
        status: "PENDING",
        lastAttemptAt: new Date(),
      },
    });
    await writeAudit(tx, currentUser, "EDIT", updated, null, {
      action: reminder ? "REMINDER_QUEUED" : "SEND_QUEUED",
    });
    return updated;
  });
};

module.exports = {
  createEnvelope,
  getEnvelopes,
  getEnvelope,
  updateEnvelope,
  queueIntegration,
};
