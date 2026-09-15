const prisma = require("../config/prisma");

const userSelect = { id: true, firstName: true, lastName: true, email: true };
const documentSelect = {
  id: true,
  name: true,
  caseId: true,
  currentVersionId: true,
  currentVersion: {
    select: { id: true, fileKey: true, mimeType: true, fileSizeBytes: true },
  },
};

const recipientSelect = {
  id: true,
  name: true,
  role: true,
  email: true,
  status: true,
  lastActivityAt: true,
  routingOrder: true,
  docusignRecipientId: true,
  caseParticipantId: true,
  attorneyId: true,
  casePartyId: true,
  caseParticipant: { select: { id: true, user: { select: userSelect } } },
  attorney: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  caseParty: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      organizationName: true,
      email: true,
    },
  },
};

const eventSelect = {
  id: true,
  eventType: true,
  message: true,
  actorEmail: true,
  occurredAt: true,
  createdAt: true,
};

const select = {
  id: true,
  caseId: true,
  envelopeId: true,
  templateId: true,
  templateName: true,
  status: true,
  failureMessage: true,
  sentAt: true,
  completedAt: true,
  lastReminderSentAt: true,
  dueDate: true,
  sourceDocumentId: true,
  signedDocumentId: true,
  sentByUserId: true,
  createdAt: true,
  updatedAt: true,
  sourceDocument: { select: documentSelect },
  signedDocument: { select: documentSelect },
  sentBy: { select: userSelect },
  recipients: {
    orderBy: [{ routingOrder: "asc" }, { createdAt: "asc" }],
    select: recipientSelect,
  },
  events: {
    orderBy: { occurredAt: "asc" },
    select: eventSelect,
  },
  case: {
    select: {
      id: true,
      caseNumber: true,
      title: true,
      caseType: true,
    },
  },
};

const create = (data, tx = prisma) =>
  tx.docuSignEnvelope.create({ data, select });
const findById = (id, tx = prisma) =>
  tx.docuSignEnvelope.findUnique({ where: { id }, select });
const findByDocusignEnvelopeId = (envelopeId, tx = prisma) =>
  tx.docuSignEnvelope.findUnique({ where: { envelopeId }, select });
const update = (id, data, tx = prisma) =>
  tx.docuSignEnvelope.update({ where: { id }, data, select });
const getMany = ({ where, skip, take }) =>
  prisma.$transaction([
    prisma.docuSignEnvelope.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select,
    }),
    prisma.docuSignEnvelope.count({ where }),
  ]);

const createEvent = (data, tx = prisma) =>
  tx.docuSignEnvelopeEvent.create({ data, select: eventSelect });

const updateRecipient = (id, data, tx = prisma) =>
  tx.docuSignRecipient.update({
    where: { id },
    data,
    select: recipientSelect,
  });

module.exports = {
  create,
  findById,
  findByDocusignEnvelopeId,
  update,
  getMany,
  createEvent,
  updateRecipient,
  select,
};
