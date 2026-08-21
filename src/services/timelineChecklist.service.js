const prisma = require("../config/prisma");
const timelineChecklistRepository = require("../repositories/timelineChecklist.repository");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");

const managerRoles = ["SUPER_ADMIN", "ADMIN_LEADERSHIP", "CASE_MANAGER"];

const paginate = (items, total, page, limit, key) => {
  const totalPages = Math.ceil(total / limit);
  return {
    [key]: items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

const assertCanManage = (currentUser) => {
  if (!managerRoles.includes(currentUser.role?.name))
    throw new ApiError(
      403,
      "You do not have permission to manage checklist items.",
    );
};

const getChecklistItem = async (caseId, itemId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const item = await timelineChecklistRepository.findChecklistItemById(itemId);
  if (!item || item.caseId !== caseId)
    throw new ApiError(404, "Checklist item not found.");
  return item;
};

const writeAuditLog = (
  tx,
  currentUser,
  action,
  item,
  previousValue,
  newValue,
) =>
  tx.auditLog.create({
    data: {
      actingUserId: currentUser.id,
      actingUserRoleSnapshot: currentUser.role?.name || null,
      action,
      module: "CASES",
      affectedRecordType: "ChecklistItem",
      affectedRecordId: item.id,
      previousValue,
      newValue,
    },
  });

const writeTimelineEvent = (
  tx,
  item,
  currentUser,
  eventType,
  summary,
  previousValue,
  newValue,
) =>
  tx.caseTimelineEvent.create({
    data: {
      caseId: item.caseId,
      eventType,
      relatedRecordType: "ChecklistItem",
      relatedRecordId: item.id,
      summary,
      actorUserId: currentUser.id,
      previousValue: previousValue ? JSON.stringify(previousValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
    },
  });

const getTimeline = async (caseId, query, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const where = {
    caseId,
    ...(query.eventType && { eventType: query.eventType }),
    ...(query.actorUserId && { actorUserId: query.actorUserId }),
    ...(query.from || query.to
      ? {
          timestamp: {
            ...(query.from && { gte: new Date(query.from) }),
            ...(query.to && { lte: new Date(query.to) }),
          },
        }
      : {}),
  };
  const [events, total] = await timelineChecklistRepository.getTimeline({
    where,
    skip: (page - 1) * limit,
    take: limit,
  });
  return paginate(events, total, page, limit, "events");
};

const createChecklistItem = async (caseId, data, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  assertCanManage(currentUser);
  return prisma.$transaction(async (tx) => {
    const item = await timelineChecklistRepository.createChecklistItem(
      { ...data, caseId, type: "MANUAL", status: "PENDING" },
      tx,
    );
    await writeAuditLog(tx, currentUser, "CREATE", item, null, {
      category: item.category,
      label: item.label,
      relatedModule: item.relatedModule,
    });
    return item;
  });
};

const getChecklistItems = async (caseId, query, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const where = {
    caseId,
    ...(query.category && { category: query.category }),
    ...(query.status && { status: query.status }),
    ...(query.type && { type: query.type }),
  };
  const [items, total] = await timelineChecklistRepository.getChecklistItems({
    where,
    skip: (page - 1) * limit,
    take: limit,
  });
  return paginate(items, total, page, limit, "items");
};

const updateChecklistItem = async (caseId, itemId, data, currentUser) => {
  const item = await getChecklistItem(caseId, itemId, currentUser);
  assertCanManage(currentUser);
  if (item.type !== "MANUAL")
    throw new ApiError(400, "System-derived checklist items cannot be edited.");
  return prisma.$transaction(async (tx) => {
    const updated = await timelineChecklistRepository.updateChecklistItem(
      itemId,
      data,
      tx,
    );
    await writeAuditLog(
      tx,
      currentUser,
      "EDIT",
      updated,
      {
        category: item.category,
        label: item.label,
        relatedModule: item.relatedModule,
      },
      {
        category: updated.category,
        label: updated.label,
        relatedModule: updated.relatedModule,
      },
    );
    return updated;
  });
};

const deleteChecklistItem = async (caseId, itemId, currentUser) => {
  const item = await getChecklistItem(caseId, itemId, currentUser);
  assertCanManage(currentUser);
  if (item.type !== "MANUAL")
    throw new ApiError(
      400,
      "System-derived checklist items cannot be deleted.",
    );
  return prisma.$transaction(async (tx) => {
    const deleted = await timelineChecklistRepository.deleteChecklistItem(
      itemId,
      tx,
    );
    await writeAuditLog(
      tx,
      currentUser,
      "DELETE",
      deleted,
      {
        category: deleted.category,
        label: deleted.label,
        status: deleted.status,
      },
      null,
    );
    return deleted;
  });
};

const completeChecklistItem = async (caseId, itemId, currentUser) => {
  const item = await getChecklistItem(caseId, itemId, currentUser);
  assertCanManage(currentUser);
  if (item.status === "COMPLETE")
    throw new ApiError(400, "Checklist item is already complete.");
  return prisma.$transaction(async (tx) => {
    const updated = await timelineChecklistRepository.updateChecklistItem(
      itemId,
      {
        status: "COMPLETE",
        completedAt: new Date(),
        completedByUserId: currentUser.id,
      },
      tx,
    );
    await writeTimelineEvent(
      tx,
      updated,
      currentUser,
      "CHECKLIST_ITEM_COMPLETED",
      `${updated.label} completed.`,
      { status: item.status },
      { status: updated.status },
    );
    await writeAuditLog(
      tx,
      currentUser,
      "EDIT",
      updated,
      { status: item.status },
      { status: updated.status },
    );
    return updated;
  });
};

const reopenChecklistItem = async (caseId, itemId, currentUser) => {
  const item = await getChecklistItem(caseId, itemId, currentUser);
  assertCanManage(currentUser);
  if (item.status !== "COMPLETE")
    throw new ApiError(400, "Only completed checklist items can be reopened.");
  return prisma.$transaction(async (tx) => {
    const updated = await timelineChecklistRepository.updateChecklistItem(
      itemId,
      {
        status: "PENDING",
        completedAt: null,
        completedByUserId: null,
      },
      tx,
    );
    await writeTimelineEvent(
      tx,
      updated,
      currentUser,
      "STATUS_CHANGED",
      `${updated.label} reopened.`,
      { status: item.status },
      { status: updated.status },
    );
    await writeAuditLog(
      tx,
      currentUser,
      "EDIT",
      updated,
      { status: item.status },
      { status: updated.status },
    );
    return updated;
  });
};

module.exports = {
  getTimeline,
  createChecklistItem,
  getChecklistItems,
  getChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  completeChecklistItem,
  reopenChecklistItem,
};
