const prisma = require("../config/prisma");

const inquiryRepository = require("../repositories/inquiry.repository");
const caseRepository = require("../repositories/case.repository");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");

const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  INQUIRY_SORT_FIELDS,
} = require("../constants/inquiry.constants");

const createInquiry = async (data) => {
  return inquiryRepository.createInquiry(data);
};

const getInquiryById = async (id) => {
  const inquiry = await inquiryRepository.findInquiryById(id);

  if (!inquiry) {
    throw new ApiError(404, "Inquiry not found.");
  }

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
    ];
  }

  if (status) {
    where.status = status;
  }

  if (caseType) {
    where.caseType = caseType;
  }

  const skip = (page - 1) * limit;
  const orderBy = { [sortBy]: sortOrder };

  const { inquiries, total } = await inquiryRepository.getInquiries({
    skip,
    take: limit,
    where,
    orderBy,
  });

  const totalPages = Math.ceil(total / limit);

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

const updateInquiry = async (id, data) => {
  const existing = await inquiryRepository.findInquiryById(id);

  if (!existing) {
    throw new ApiError(404, "Inquiry not found.");
  }

  if (existing.status === "CONVERTED") {
    throw new ApiError(400, "This inquiry has already been converted to a case.");
  }

  return inquiryRepository.updateInquiry(id, data);
};

const convertToCase = async (id, payload = {}) => {
  const inquiry = await inquiryRepository.findInquiryById(id);

  if (!inquiry) {
    throw new ApiError(404, "Inquiry not found.");
  }

  if (inquiry.status === "CONVERTED") {
    throw new ApiError(400, "This inquiry has already been converted to a case.");
  }

  if (inquiry.status === "ARCHIVED") {
    throw new ApiError(400, "Archived inquiries cannot be converted to a case.");
  }

  const caseType = payload.caseType || inquiry.caseType;

  if (!caseType) {
    throw new ApiError(
      400,
      "caseType is required (the inquiry does not have one set)."
    );
  }

  const caseManagerId = payload.caseManagerId || inquiry.preliminaryCaseManagerId;

  if (!caseManagerId) {
    throw new ApiError(
      400,
      "caseManagerId is required (the inquiry has no preliminary case manager)."
    );
  }

  await caseService.assertActiveCaseManager(caseManagerId);

  const createdCaseId = await prisma.$transaction(async (tx) => {
    const caseNumber = await caseService.generateCaseNumber(caseType, tx);

    const newCase = await caseRepository.createCase(
      {
        caseNumber,
        inquiryId: inquiry.id,
        title: payload.title || inquiry.matterName,
        caseType,
        disputeCategoryId: payload.disputeCategoryId || inquiry.disputeCategoryId,
        jurisdiction: inquiry.locationJurisdiction,
        isInternational: inquiry.isInternational,
        lifecycleStatus: "INTAKE",
      },
      tx
    );

    await caseRepository.setPrimaryCaseManager(newCase.id, caseManagerId, tx);
    await inquiryRepository.markInquiryConverted(inquiry.id, tx);

    return newCase.id;
  });

  return caseService.mapCase(await caseRepository.findCaseById(createdCaseId));
};

module.exports = {
  createInquiry,
  getInquiryById,
  getInquiries,
  updateInquiry,
  convertToCase,
};
