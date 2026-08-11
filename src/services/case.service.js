const prisma = require("../config/prisma");

const caseRepository = require("../repositories/case.repository");
const ApiError = require("../utils/apiError");

const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  CASE_SORT_FIELDS,
  CASE_PREFIXES,
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
    select: { id: true, status: true },
  });

  if (!manager) {
    throw new ApiError(404, "Case manager not found.");
  }

  if (manager.status !== "ACTIVE") {
    throw new ApiError(400, "Selected case manager is not an active user.");
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
      tx
    );

    await caseRepository.setPrimaryCaseManager(newCase.id, caseManagerId, tx);

    return newCase.id;
  });

  return mapCase(await caseRepository.findCaseById(createdCaseId));
};

const assertCaseAccess = (caseData, currentUser) => {
  if (
    currentUser.role?.name === "CASE_MANAGER" &&
    caseData.caseManager?.id !== currentUser.id
  ) {
    throw new ApiError(403, "You do not have access to this case.");
  }
};

const getCaseById = async (id, currentUser) => {
  const caseData = mapCase(await caseRepository.findCaseById(id));

  if (!caseData) {
    throw new ApiError(404, "Case not found.");
  }

  assertCaseAccess(caseData, currentUser);

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

  if (currentUser.role?.name === "CASE_MANAGER") {
    where.participants = {
      some: { userId: currentUser.id, role: "CASE_MANAGER" },
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

const updateCase = async (id, data, currentUser) => {
  const existingCase = mapCase(await caseRepository.findCaseById(id));

  if (!existingCase) {
    throw new ApiError(404, "Case not found.");
  }

  assertCaseAccess(existingCase, currentUser);

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

  assertCaseAccess(existingCase, currentUser);

  return mapCase(await caseRepository.updateCase(id, { lifecycleStatus }));
};

module.exports = {
  createCase,
  getCases,
  getCaseById,
  updateCase,
  updateCaseStatus,
  mapCase,
  generateCaseNumber,
  assertActiveCaseManager,
};
