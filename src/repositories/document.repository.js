const prisma = require("../config/prisma");

const userSelect = { id: true, firstName: true, lastName: true, email: true };
const versionSelect = {
  id: true,
  versionNumber: true,
  fileKey: true,
  fileSizeBytes: true,
  mimeType: true,
  changesNotes: true,
  isNewVersionOfExisting: true,
  notifyParticipants: true,
  createdAt: true,
  uploadedBy: { select: userSelect },
};
const documentSelect = {
  id: true,
  caseId: true,
  name: true,
  description: true,
  visibility: true,
  reviewStatus: true,
  processingStatus: true,
  currentVersionId: true,
  uploadedByUserId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  category: { select: { id: true, name: true } },
  tags: { select: { id: true, name: true, isCustom: true } },
  uploadedBy: { select: userSelect },
  currentVersion: { select: versionSelect },
  accessGrants: {
    select: {
      caseParticipantId: true,
      caseParticipant: { select: { userId: true, role: true } },
    },
  },
};

const createDocument = (data, tx = prisma) =>
  tx.document.create({ data, select: documentSelect });
const updateDocument = (id, data, tx = prisma) =>
  tx.document.update({ where: { id }, data, select: documentSelect });
const findDocumentById = (id, tx = prisma) =>
  tx.document.findUnique({ where: { id }, select: documentSelect });
const createVersion = (data, tx = prisma) =>
  tx.documentVersion.create({ data, select: versionSelect });
const getDocuments = ({ where, skip, take }) =>
  prisma.$transaction([
    prisma.document.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: documentSelect,
    }),
    prisma.document.count({ where }),
  ]);
const getVersions = (documentId) =>
  prisma.documentVersion.findMany({
    where: { documentId },
    orderBy: { versionNumber: "desc" },
    select: versionSelect,
  });
const getAccessLogs = (documentId, skip, take) =>
  prisma.$transaction([
    prisma.documentAccessLog.findMany({
      where: { documentId },
      skip,
      take,
      orderBy: { timestamp: "desc" },
      select: {
        id: true,
        action: true,
        timestamp: true,
        accessedBy: { select: userSelect },
      },
    }),
    prisma.documentAccessLog.count({ where: { documentId } }),
  ]);
const findParticipants = (caseId, ids, tx = prisma) =>
  tx.caseParticipant.findMany({
    where: { caseId, id: { in: ids }, accessStatus: "ACTIVE" },
    select: { id: true },
  });

module.exports = {
  createDocument,
  updateDocument,
  findDocumentById,
  createVersion,
  getDocuments,
  getVersions,
  getAccessLogs,
  findParticipants,
};
