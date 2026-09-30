const prisma = require("../config/prisma");

const inquiryRepository = require("../repositories/inquiry.repository");
const caseRepository = require("../repositories/case.repository");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");
const {
  normalizeInquiryPayload,
  normalizeCaseTypeInput,
  emptyToNull,
} = require("../utils/cmPayloadNormalize");

const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  INQUIRY_SORT_FIELDS,
} = require("../constants/inquiry.constants");

const { PartySide } = require("../constants/inquiry.constants");

const sanitizeCounselFor = (value) => {
  if (value == null || value === "") return null;
  if (Object.values(PartySide || {}).includes(value)) return value;
  const upper = String(value).toUpperCase().replace(/\s+/g, "_");
  if (upper === "CLAIMANT" || upper === "RESPONDENT") return upper;
  return null;
};

const buildInquiryWriteData = async (rawBody, tx = prisma) => {
  const normalized = normalizeInquiryPayload(rawBody);
  const {
    neutralUserIds,
    disputeCategoryName,
    disputeCategoryId,
    ...fields
  } = normalized;

  let resolvedCategoryId = disputeCategoryId || null;
  if (!resolvedCategoryId && disputeCategoryName) {
    const category = await inquiryRepository.findOrCreateDisputeCategoryByName(
      disputeCategoryName,
      tx,
    );
    resolvedCategoryId = category?.id || null;
  }

  const data = {
    inquiryDate: fields.inquiryDate ? new Date(fields.inquiryDate) : undefined,
    matterName: fields.matterName,
    initialContactName: fields.initialContactName,
    inquiryContactType: emptyToNull(fields.inquiryContactType),
    fromFirm: emptyToNull(fields.fromFirm),
    counselFor: sanitizeCounselFor(fields.counselFor),
    contactEmail: emptyToNull(fields.contactEmail),
    contactPhone: emptyToNull(fields.contactPhone),
    contactCellPhone: emptyToNull(fields.contactCellPhone),
    clientReference: emptyToNull(fields.clientReference),
    caseType: fields.caseType || null,
    caseTypeLabel: emptyToNull(fields.caseTypeLabel),
    disputeCategoryId: resolvedCategoryId,
    locationJurisdiction: emptyToNull(fields.locationJurisdiction),
    daysRequested: fields.daysRequested ?? null,
    timeFrameRequested: emptyToNull(fields.timeFrameRequested),
    sourceOfInquiry: emptyToNull(fields.sourceOfInquiry),
    referredBy: emptyToNull(fields.referredBy),
    comments: emptyToNull(fields.comments),
    isInternational: fields.isInternational ?? false,
    isDraft: fields.isDraft ?? true,
    preliminaryCaseManagerId: fields.preliminaryCaseManagerId || null,
  };

  Object.keys(data).forEach((key) => {
    if (data[key] === undefined) delete data[key];
  });

  return { data, neutralUserIds: neutralUserIds || [] };
};

const createInquiry = async (rawBody) => {
  return prisma.$transaction(async (tx) => {
    const { data, neutralUserIds } = await buildInquiryWriteData(rawBody, tx);
    const inquiry = await inquiryRepository.createInquiry(data, tx);
    if (neutralUserIds.length) {
      await inquiryRepository.replacePreliminaryNeutrals(
        inquiry.id,
        neutralUserIds,
        tx,
      );
    }
    return inquiryRepository.findInquiryById(inquiry.id, tx);
  });
};

const getInquiryById = async (id) => {
  const inquiry = await inquiryRepository.findInquiryById(id);
  if (!inquiry) throw new ApiError(404, "Inquiry not found.");
  return inquiry;
};

const getInquiries = async (query) => {
  const page = Number(query.page) || DEFAULT_PAGE;
  const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  const {
    search,
    status,
    caseType,
    sortBy = INQUIRY_SORT_FIELDS.CREATED_AT,
    sortOrder = "desc",
  } = query;

  const where = {};
  if (search) {
    where.OR = [
      { matterName: { contains: search, mode: "insensitive" } },
      { initialContactName: { contains: search, mode: "insensitive" } },
      { contactEmail: { contains: search, mode: "insensitive" } },
      { clientReference: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status) where.status = status;
  if (caseType) where.caseType = caseType;

  const { inquiries, total } = await inquiryRepository.getInquiries({
    skip: (page - 1) * limit,
    take: limit,
    where,
    orderBy: { [sortBy]: sortOrder },
  });

  const totalPages = Math.ceil(total / limit) || 0;
  return {
    inquiries,
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

const updateInquiry = async (id, rawBody) => {
  const existing = await inquiryRepository.findInquiryById(id);
  if (!existing) throw new ApiError(404, "Inquiry not found.");
  if (existing.status === "CONVERTED") {
    throw new ApiError(400, "This inquiry has already been converted to a case.");
  }

  return prisma.$transaction(async (tx) => {
    const { data, neutralUserIds } = await buildInquiryWriteData(
      { ...existing, ...rawBody },
      tx,
    );
    delete data.inquiryDate;
    if (rawBody.inquiryDate) data.inquiryDate = new Date(rawBody.inquiryDate);
    await inquiryRepository.updateInquiry(id, data, tx);
    if (
      rawBody.neutralUserIds !== undefined
      || rawBody.assignedNeutrals !== undefined
    ) {
      await inquiryRepository.replacePreliminaryNeutrals(id, neutralUserIds, tx);
    }
    return inquiryRepository.findInquiryById(id, tx);
  });
};

const convertToCase = async (id, payload = {}, currentUser) => {
  const inquiry = await inquiryRepository.findInquiryById(id);
  if (!inquiry) throw new ApiError(404, "Inquiry not found.");
  if (inquiry.status === "CONVERTED") {
    throw new ApiError(400, "This inquiry has already been converted to a case.");
  }
  if (inquiry.status === "ARCHIVED") {
    throw new ApiError(400, "Archived inquiries cannot be converted to a case.");
  }

  const typeInput = normalizeCaseTypeInput(payload.caseType || inquiry.caseType);
  const caseType = typeInput.caseType || inquiry.caseType;
  if (!caseType) {
    throw new ApiError(400, "caseType is required (the inquiry does not have one set).");
  }

  const caseManagerId =
    payload.caseManagerId || inquiry.preliminaryCaseManagerId;
  if (!caseManagerId) {
    throw new ApiError(
      400,
      "caseManagerId is required (the inquiry has no preliminary case manager).",
    );
  }

  await caseService.assertActiveCaseManager(caseManagerId);

  const neutralIds = [
    ...(payload.neutralUserIds || []),
    ...((inquiry.preliminaryNeutrals || []).map((n) => n.userId)),
  ].filter(Boolean);

  const createdCaseId = await prisma.$transaction(async (tx) => {
    const caseNumber = await caseService.generateCaseNumber(caseType, tx);
    const newCase = await caseRepository.createCase(
      {
        caseNumber,
        inquiryId: inquiry.id,
        title: payload.title || inquiry.matterName,
        summary: inquiry.comments || null,
        caseType,
        caseTypeLabel: typeInput.caseTypeLabel || inquiry.caseTypeLabel || null,
        disputeCategoryId:
          payload.disputeCategoryId || inquiry.disputeCategoryId,
        jurisdiction: inquiry.locationJurisdiction,
        isInternational: inquiry.isInternational,
        referralSource: inquiry.sourceOfInquiry || null,
        lifecycleStatus: "INTAKE",
        isDraft: false,
      },
      tx,
    );

    await caseRepository.setPrimaryCaseManager(newCase.id, caseManagerId, tx);

    for (const userId of [...new Set(neutralIds)]) {
      await tx.caseParticipant.create({
        data: {
          caseId: newCase.id,
          userId,
          role: "NEUTRAL",
          isPrimary: false,
          assignmentType: "ASSIGNED",
          accessStatus: "ACTIVE",
        },
      });
    }

    await inquiryRepository.markInquiryConverted(inquiry.id, tx);

    await tx.caseTimelineEvent.create({
      data: {
        caseId: newCase.id,
        eventType: "CASE_CREATED",
        relatedRecordType: "Case",
        relatedRecordId: newCase.id,
        summary: `Case ${caseNumber} created from inquiry.`,
        actorUserId: currentUser?.id || null,
      },
    });

    return newCase.id;
  });

  const readinessChecklistService = require("./readinessChecklist.service");
  await readinessChecklistService.ensureReadinessChecklist(createdCaseId);

  return caseService.mapCase(await caseRepository.findCaseById(createdCaseId));
};

module.exports = {
  createInquiry,
  getInquiryById,
  getInquiries,
  updateInquiry,
  convertToCase,
};
