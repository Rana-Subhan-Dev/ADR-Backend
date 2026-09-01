const prisma = require("../config/prisma");

const caseRepository = require("../repositories/case.repository");
const ApiError = require("../utils/apiError");

const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  CASE_SORT_FIELDS,
  CASE_PREFIXES,
  CLOSURE_CHECKLIST_LABELS,
  CLOSURE_DERIVED_LABELS,
  CLOSABLE_STATUSES,
} = require("../constants/case.constants");

const mapCase = (caseRecord) => {
  if (!caseRecord) {
    return caseRecord;
  }

  const { participants, ...rest } = caseRecord;

  return {
    ...rest,
    caseManager: participants?.[0]?.user ?? null,
  };
};

const generateCaseNumber = async (caseType, tx) => {
  const prefix = CASE_PREFIXES[caseType];

  if (!prefix) {
    throw new ApiError(400, "Invalid case type.");
  }

  const year = new Date().getFullYear();

  const lastCase = await tx.case.findFirst({
    where: {
      caseNumber: { startsWith: `${prefix}-${year}-` },
    },
    orderBy: { caseNumber: "desc" },
    select: { caseNumber: true },
  });

  let sequence = 1;

  if (lastCase) {
    const lastSequence = Number(lastCase.caseNumber.split("-").pop());

    if (!Number.isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }

  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
};

const assertActiveCaseManager = async (caseManagerId) => {
  const manager = await prisma.user.findUnique({
    where: { id: caseManagerId },
    select: { id: true, status: true, role: { select: { name: true } } },
  });

  if (!manager) {
    throw new ApiError(404, "Case manager not found.");
  }

  if (manager.status !== "ACTIVE") {
    throw new ApiError(400, "Selected case manager is not an active user.");
  }

  if (manager.role.name !== "CASE_MANAGER") {
    throw new ApiError(400, "Selected user must have the Case Manager role.");
  }
};

const createCase = async (data, currentUserId) => {
  const { caseManagerId, ...caseData } = data;

  await assertActiveCaseManager(caseManagerId);

  const createdCaseId = await prisma.$transaction(async (tx) => {
    const caseNumber = await generateCaseNumber(caseData.caseType, tx);

    const newCase = await caseRepository.createCase(
      {
        ...caseData,
        caseNumber,
        lifecycleStatus: "INTAKE",
      },
      tx,
    );

    await caseRepository.setPrimaryCaseManager(newCase.id, caseManagerId, tx);

    return newCase.id;
  });

  return mapCase(await caseRepository.findCaseById(createdCaseId));
};

const hasGlobalCaseAccess = (roleName) =>
  ["SUPER_ADMIN", "ADMIN_LEADERSHIP", "ACCOUNTING_STAFF"].includes(roleName);

const assertCaseAccess = async (caseData, currentUser) => {
  const roleName = currentUser.role?.name;

  if (hasGlobalCaseAccess(roleName)) return;

  const participant = await prisma.caseParticipant.findFirst({
    where: {
      caseId: caseData.id,
      userId: currentUser.id,
      role: roleName,
      accessStatus: "ACTIVE",
    },
    select: { id: true },
  });

  if (!participant) {
    throw new ApiError(403, "You do not have access to this case.");
  }
};

const getCaseById = async (id, currentUser) => {
  const caseData = mapCase(await caseRepository.findCaseById(id));

  if (!caseData) {
    throw new ApiError(404, "Case not found.");
  }

  await assertCaseAccess(caseData, currentUser);

  return caseData;
};

const getCases = async (query, currentUser) => {
  const page = Number(query.page) || DEFAULT_PAGE;

  const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, MAX_LIMIT);

  const {
    search,
    caseType,
    disputeCategoryId,
    lifecycleStatus,
    caseManagerId,
    sortBy = CASE_SORT_FIELDS.CREATED_AT,
    sortOrder = "desc",
  } = query;

  const where = {};

  if (!hasGlobalCaseAccess(currentUser.role?.name)) {
    where.participants = {
      some: {
        userId: currentUser.id,
        role: currentUser.role?.name,
        accessStatus: "ACTIVE",
      },
    };
  } else if (caseManagerId) {
    where.participants = {
      some: { userId: caseManagerId, role: "CASE_MANAGER" },
    };
  }

  if (search) {
    where.OR = [
      { caseNumber: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
    ];
  }

  if (caseType) {
    where.caseType = caseType;
  }

  if (disputeCategoryId) {
    where.disputeCategoryId = disputeCategoryId;
  }

  if (lifecycleStatus) {
    where.lifecycleStatus = lifecycleStatus;
  }

  const skip = (page - 1) * limit;
  const orderBy = { [sortBy]: sortOrder };

  const { cases, total } = await caseRepository.getCases({
    skip,
    take: limit,
    where,
    orderBy,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    cases: cases.map(mapCase),
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

const assertCaseNotClosed = (caseData) => {
  if (caseData.lifecycleStatus === "CLOSED") {
    throw new ApiError(400, "Closed cases are read-only.");
  }
};

const evaluateDerivedClosureStatus = async (caseId, label) => {
  switch (label) {
    case "Outcome Notes Added":
      return (
        (await prisma.caseNote.count({
          where: { caseId, noteType: "CASE_UPDATE" },
        })) > 0
      );
    case "Final Hearing Completed":
      return (
        (await prisma.hearing.count({
          where: { caseId, hearingStatus: "COMPLETED" },
        })) > 0
      );
    case "Required Documents Uploaded":
      return (
        (await prisma.document.count({
          where: { caseId, deletedAt: null },
        })) > 0
      );
    default:
      return null;
  }
};

const ensureClosureChecklist = async (caseId, tx = prisma) => {
  const existing = await tx.checklistItem.findMany({
    where: { caseId, category: "CLOSURE" },
    select: { id: true, label: true, status: true },
  });
  const existingLabels = new Set(existing.map((item) => item.label));
  const missingLabels = CLOSURE_CHECKLIST_LABELS.filter(
    (label) => !existingLabels.has(label),
  );

  if (missingLabels.length) {
    await tx.checklistItem.createMany({
      data: missingLabels.map((label) => ({
        caseId,
        category: "CLOSURE",
        label,
        type: "SYSTEM_DERIVED",
        status: "PENDING",
        relatedModule: "CASES",
      })),
    });
  }

  return tx.checklistItem.findMany({
    where: { caseId, category: "CLOSURE" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      status: true,
      type: true,
      completedAt: true,
      completedByUserId: true,
    },
  });
};

const syncDerivedClosureChecklist = async (caseId, tx = prisma) => {
  const items = await ensureClosureChecklist(caseId, tx);

  for (const item of items) {
    if (!CLOSURE_DERIVED_LABELS.has(item.label) || item.status === "COMPLETE") {
      continue;
    }

    const isComplete = await evaluateDerivedClosureStatus(caseId, item.label);

    if (isComplete) {
      await tx.checklistItem.update({
        where: { id: item.id },
        data: {
          status: "COMPLETE",
          completedAt: new Date(),
        },
      });
      item.status = "COMPLETE";
      item.completedAt = new Date();
    }
  }

  return items;
};

const getClosureChecklist = async (id, currentUser) => {
  const caseData = await getCaseById(id, currentUser);
  assertCaseNotClosed(caseData);

  const items = await syncDerivedClosureChecklist(id);
  const allComplete = items.every((item) => item.status === "COMPLETE");

  return {
    items,
    allComplete,
    canClose: allComplete,
  };
};

const writeCaseTimelineEvent = (
  tx,
  caseId,
  currentUser,
  eventType,
  summary,
  previousValue,
  newValue,
) =>
  tx.caseTimelineEvent.create({
    data: {
      caseId,
      eventType,
      relatedRecordType: "Case",
      relatedRecordId: caseId,
      summary,
      actorUserId: currentUser.id,
      previousValue: previousValue ? JSON.stringify(previousValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
    },
  });

const closeCase = async (id, data, currentUser) => {
  const existingCase = mapCase(await caseRepository.findCaseById(id));

  if (!existingCase) {
    throw new ApiError(404, "Case not found.");
  }

  await assertCaseAccess(existingCase, currentUser);

  if (!CLOSABLE_STATUSES.has(existingCase.lifecycleStatus)) {
    throw new ApiError(
      400,
      "Only active or reopened cases can be closed.",
    );
  }

  const closedAt = new Date(data.closeDate);

  return prisma.$transaction(async (tx) => {
    const items = await syncDerivedClosureChecklist(id, tx);
    const incompleteItems = items.filter((item) => item.status !== "COMPLETE");

    if (incompleteItems.length) {
      throw new ApiError(
        400,
        "All closure checklist items must be completed before closing the case.",
      );
    }

    const updatedCase = await tx.case.update({
      where: { id },
      data: {
        lifecycleStatus: "CLOSED",
        closedAt,
        closureSummary: data.closureSummary,
        reopenReason: null,
      },
      select: caseRepository.CASE_SELECT,
    });

    await writeCaseTimelineEvent(
      tx,
      id,
      currentUser,
      "CASE_CLOSED",
      "Case closed.",
      {
        lifecycleStatus: existingCase.lifecycleStatus,
        closedAt: existingCase.closedAt,
      },
      {
        lifecycleStatus: "CLOSED",
        closedAt,
        closureSummary: data.closureSummary,
      },
    );

    return mapCase(updatedCase);
  });
};

const reopenCase = async (id, data, currentUser) => {
  const existingCase = mapCase(await caseRepository.findCaseById(id));

  if (!existingCase) {
    throw new ApiError(404, "Case not found.");
  }

  await assertCaseAccess(existingCase, currentUser);

  if (existingCase.lifecycleStatus !== "CLOSED") {
    throw new ApiError(400, "Only closed cases can be reopened.");
  }

  return prisma.$transaction(async (tx) => {
    const updatedCase = await tx.case.update({
      where: { id },
      data: {
        lifecycleStatus: "REOPENED",
        reopenReason: data.reopenReason,
        closedAt: null,
      },
      select: caseRepository.CASE_SELECT,
    });

    await writeCaseTimelineEvent(
      tx,
      id,
      currentUser,
      "CASE_REOPENED",
      `Case reopened: ${data.reopenReason}`,
      {
        lifecycleStatus: existingCase.lifecycleStatus,
        closedAt: existingCase.closedAt,
      },
      {
        lifecycleStatus: "REOPENED",
        reopenReason: data.reopenReason,
      },
    );

    return mapCase(updatedCase);
  });
};

const updateCase = async (id, data, currentUser) => {
  const existingCase = mapCase(await caseRepository.findCaseById(id));

  if (!existingCase) {
    throw new ApiError(404, "Case not found.");
  }

  await assertCaseAccess(existingCase, currentUser);
  assertCaseNotClosed(existingCase);

  const { caseManagerId, ...caseData } = data;

  if (caseManagerId) {
    await assertActiveCaseManager(caseManagerId);

    await caseRepository.setPrimaryCaseManager(id, caseManagerId);
  }

  if (Object.keys(caseData).length > 0) {
    await caseRepository.updateCase(id, caseData);
  }

  return mapCase(await caseRepository.findCaseById(id));
};

const updateCaseStatus = async (id, lifecycleStatus, currentUser) => {
  const existingCase = mapCase(await caseRepository.findCaseById(id));

  if (!existingCase) {
    throw new ApiError(404, "Case not found.");
  }

  await assertCaseAccess(existingCase, currentUser);
  assertCaseNotClosed(existingCase);

  if (lifecycleStatus === "CLOSED" || lifecycleStatus === "REOPENED") {
    throw new ApiError(
      400,
      "Use the dedicated close or reopen endpoints for this action.",
    );
  }

  return mapCase(await caseRepository.updateCase(id, { lifecycleStatus }));
};

module.exports = {
  createCase,
  getCases,
  getCaseById,
  updateCase,
  updateCaseStatus,
  getClosureChecklist,
  closeCase,
  reopenCase,
  mapCase,
  generateCaseNumber,
  assertActiveCaseManager,
};
