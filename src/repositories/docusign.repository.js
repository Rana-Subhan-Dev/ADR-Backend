const prisma = require("../config/prisma");

const userSelect = { id: true, firstName: true, lastName: true, email: true };
const recipientSelect = {
  id: true,
  name: true,
  role: true,
  email: true,
  status: true,
  lastActivityAt: true,
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
const select = {
  id: true,
  caseId: true,
  envelopeId: true,
  templateId: true,
  status: true,
  failureMessage: true,
  sentAt: true,
  completedAt: true,
  lastReminderSentAt: true,
  signedDocumentId: true,
  createdAt: true,
  updatedAt: true,
  signedDocument: { select: { id: true, name: true, currentVersionId: true } },
  recipients: { select: recipientSelect },
};

const create = (data, tx = prisma) =>
  tx.docuSignEnvelope.create({ data, select });
const findById = (id, tx = prisma) =>
  tx.docuSignEnvelope.findUnique({ where: { id }, select });
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

module.exports = { create, findById, update, getMany };
