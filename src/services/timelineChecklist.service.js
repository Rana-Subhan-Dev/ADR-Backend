const prisma = require("../config/prisma");
const timelineChecklistRepository = require("../repositories/timelineChecklist.repository");
const caseService = require("./case.service");
const readinessChecklistService = require("./readinessChecklist.service");
const ApiError = require("../utils/apiError");
const { NEUTRAL_READINESS_LABELS } = require("../constants/case.constants");
const { RoleName } = require("../constants/auth.constants");

const managerRoles = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN_LEADERSHIP,
  RoleName.CASE_MANAGER,
];
const externalRoles = [RoleName.LAWYER, RoleName.CLIENT];

const FINANCE_EVENT_TYPES = new Set(["INVOICE_ISSUED", "PAYMENT_RECEIVED"]);
const INTERNAL_ONLY_EVENT_TYPES = new Set(["CHECKLIST_ITEM_COMPLETED"]);

const paginate = (items, total, page, limit, key) => {
  const totalPages = Math.ceil(total / limit) || 1;
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

const roleName = (user) => user.role?.name;

const assertCanManageChecklist = (currentUser) => {
  if (!managerRoles.includes(roleName(currentUser)))
    throw new ApiError(
      403,
      "You do not have permission to manage checklist items.",
    );
};

const assertCanViewChecklist = (currentUser) => {
  const role = roleName(currentUser);
  if (externalRoles.includes(role))
    throw new ApiError(
      403,
      "External users cannot view administrative checklists.",
    );
};

const assertCanAccessClosure = (currentUser) => {
  if (roleName(currentUser) === RoleName.NEUTRAL)
    throw new ApiError(403, "Neutrals cannot access the closure checklist.");
};

const getChecklistItem = async (caseId, itemId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  assertCanViewChecklist(currentUser);
  const item = await timelineChecklistRepository.findChecklistItemById(itemId);
  if (!item || item.caseId !== caseId)
    throw new ApiError(404, "Checklist item not found.");
  if (item.category === "CLOSURE") assertCanAccessClosure(currentUser);
  if (
    roleName(currentUser) === RoleName.NEUTRAL &&
    item.category === "READINESS" &&
    !NEUTRAL_READINESS_LABELS.has(item.label)
  ) {
    throw new ApiError(403, "You do not have access to this checklist item.");
  }
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

  const role = roleName(currentUser);
  if (role === RoleName.ACCOUNTING_STAFF) {
    if (query.eventType && !FINANCE_EVENT_TYPES.has(query.eventType)) {
      return paginate([], 0, page, limit, "events");
    }
    where.eventType = query.eventType
      ? query.eventType
      : { in: [...FINANCE_EVENT_TYPES] };
  } else if (externalRoles.includes(role) || role === RoleName.NEUTRAL) {
    const excluded = [...INTERNAL_ONLY_EVENT_TYPES, ...FINANCE_EVENT_TYPES];
    if (query.eventType) {
      if (excluded.includes(query.eventType)) {
        return paginate([], 0, page, limit, "events");
      }
    } else {
      where.eventType = { notIn: excluded };
    }
  }

  const [events, total] = await timelineChecklistRepository.getTimeline({
    where,
    skip: (page - 1) * limit,
    take: limit,
  });
  return paginate(events, total, page, limit, "events");
};

const getChecklistItems = async (caseId, query, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  assertCanViewChecklist(currentUser);

  const category = query.category || null;
  if (category === "CLOSURE") assertCanAccessClosure(currentUser);

  if (category === "READINESS" || !category) {
    await readinessChecklistService.syncDerivedReadinessChecklist(caseId);
  }

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const where = {
    caseId,
    ...(category && { category }),
    ...(query.status && { status: query.status }),
    ...(query.type && { type: query.type }),
  };

  if (roleName(currentUser) === RoleName.NEUTRAL) {
    where.category = "READINESS";
    where.label = { in: [...NEUTRAL_READINESS_LABELS] };
  }

  if (category === "READINESS" || roleName(currentUser) === RoleName.NEUTRAL) {
    const [fullItems] = await timelineChecklistRepository.getChecklistItems({
      where,
      skip: 0,
      take: 200,
    });
    const ordered = [...fullItems].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    );
    const summary = readinessChecklistService.buildReadinessSummary(ordered);
    return {
      items: ordered,
      summary,
      pagination: {
        page: 1,
        limit: ordered.length || 1,
        total: ordered.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
  }

  const [items, total] = await timelineChecklistRepository.getChecklistItems({
    where,
    skip: (page - 1) * limit,
    take: limit,
  });
  return paginate(items, total, page, limit, "items");
};

const completeChecklistItem = async (caseId, itemId, currentUser) => {
  const item = await getChecklistItem(caseId, itemId, currentUser);
  assertCanManageChecklist(currentUser);
  if (item.status === "COMPLETE")
    throw new ApiError(400, "Checklist item is already complete.");
  if (item.type === "SYSTEM_DERIVED")
    throw new ApiError(
      400,
      "System-derived checklist items are updated automatically.",
    );
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

const markChecklistItemNotApplicable = async (caseId, itemId, currentUser) => {
  const item = await getChecklistItem(caseId, itemId, currentUser);
  assertCanManageChecklist(currentUser);
  return prisma.$transaction(async (tx) => {
    const updated = await timelineChecklistRepository.updateChecklistItem(
      itemId,
      {
        status: "NOT_APPLICABLE",
        completedAt: null,
        completedByUserId: null,
      },
      tx,
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
  getChecklistItems,
  completeChecklistItem,
  markChecklistItemNotApplicable,
};
