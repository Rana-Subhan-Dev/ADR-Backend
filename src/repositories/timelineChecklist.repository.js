const prisma = require("../config/prisma");

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
};

const timelineSelect = {
  id: true,
  caseId: true,
  eventType: true,
  relatedRecordType: true,
  relatedRecordId: true,
  previousValue: true,
  newValue: true,
  summary: true,
  actorUserId: true,
  timestamp: true,
  actor: { select: userSelect },
};

const checklistSelect = {
  id: true,
  caseId: true,
  category: true,
  label: true,
  status: true,
  type: true,
  relatedModule: true,
  completedAt: true,
  completedByUserId: true,
  createdAt: true,
  updatedAt: true,
  completedBy: { select: userSelect },
};

const getTimeline = ({ where, skip, take }) =>
  prisma.$transaction([
    prisma.caseTimelineEvent.findMany({
      where,
      skip,
      take,
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      select: timelineSelect,
    }),
    prisma.caseTimelineEvent.count({ where }),
  ]);

const createChecklistItem = (data, tx = prisma) =>
  tx.checklistItem.create({ data, select: checklistSelect });

const findChecklistItemById = (id, tx = prisma) =>
  tx.checklistItem.findUnique({ where: { id }, select: checklistSelect });

const getChecklistItems = ({ where, skip, take }) =>
  prisma.$transaction([
    prisma.checklistItem.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: checklistSelect,
    }),
    prisma.checklistItem.count({ where }),
  ]);

const updateChecklistItem = (id, data, tx = prisma) =>
  tx.checklistItem.update({ where: { id }, data, select: checklistSelect });

const deleteChecklistItem = (id, tx = prisma) =>
  tx.checklistItem.delete({ where: { id }, select: checklistSelect });

module.exports = {
  getTimeline,
  createChecklistItem,
  findChecklistItemById,
  getChecklistItems,
  updateChecklistItem,
  deleteChecklistItem,
};
