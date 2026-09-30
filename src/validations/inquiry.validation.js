const Joi = require("joi");

const {
  InquiryStatus,
  PartySide,
  INQUIRY_SORT_FIELDS,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} = require("../constants/inquiry.constants");

const { CaseType } = require("../constants/case.constants");
const { normalizeInquiryPayload } = require("../utils/cmPayloadNormalize");

const phonePattern = /^[0-9+\-\s()]+$/;

const inquiryBodySchema = Joi.object({
  inquiryDate: Joi.date().iso(),
  matterName: Joi.string().trim().min(2).max(255),
  initialContactName: Joi.string().trim().min(2).max(255),
  initialContact: Joi.string().trim().min(2).max(255),
  inquiryContactType: Joi.string().trim().max(100).allow("", null),
  fromFirm: Joi.string().trim().max(255).allow("", null),
  counselFor: Joi.alternatives().try(
    Joi.string().valid(...Object.values(PartySide)),
    Joi.string().trim().max(255).allow("", null),
  ),
  contactEmail: Joi.string().email().trim().lowercase().allow("", null),
  email: Joi.string().email().trim().lowercase().allow("", null),
  contactPhone: Joi.string().trim().pattern(phonePattern).allow("", null),
  phone: Joi.string().trim().pattern(phonePattern).allow("", null),
  contactCellPhone: Joi.string().trim().pattern(phonePattern).allow("", null),
  cellPhone: Joi.string().trim().pattern(phonePattern).allow("", null),
  clientReference: Joi.string().trim().max(40).allow("", null),
  inquiryCaseNumber: Joi.string().trim().max(40).allow("", null),
  caseType: Joi.string().trim().max(100).allow("", null),
  caseTypeLabel: Joi.string().trim().max(100).allow("", null),
  disputeCategoryId: Joi.string().uuid().allow(null),
  disputeCategoryName: Joi.string().trim().max(255).allow("", null),
  disputeType: Joi.string().trim().max(255).allow("", null),
  locationJurisdiction: Joi.string().trim().max(255).allow("", null),
  location: Joi.string().trim().max(255).allow("", null),
  daysRequested: Joi.number().integer().min(0).max(365).allow(null),
  timeFrameRequested: Joi.string().trim().max(255).allow("", null),
  timeframeRequested: Joi.string().trim().max(255).allow("", null),
  sourceOfInquiry: Joi.string().trim().max(255).allow("", null),
  referredBy: Joi.string().trim().max(255).allow("", null),
  comments: Joi.string().trim().max(5000).allow("", null),
  isInternational: Joi.boolean(),
  isDraft: Joi.boolean(),
  preliminaryCaseManagerId: Joi.string().uuid().allow(null),
  assignedCaseManager: Joi.string().uuid().allow(null),
  assignedCaseManagerId: Joi.string().uuid().allow(null),
  neutralUserIds: Joi.array().items(Joi.string().uuid()).optional(),
  assignedNeutrals: Joi.array().items(Joi.string().uuid()).optional(),
}).unknown(false);

const createInquirySchema = inquiryBodySchema
  .keys({
    inquiryDate: Joi.date().iso().required(),
    matterName: Joi.string().trim().min(2).max(255).required(),
  })
  .custom((value, helpers) => {
    const normalized = normalizeInquiryPayload(value);
    if (!normalized.initialContactName) {
      return helpers.error("any.custom", {
        message: "initialContactName (or initialContact) is required.",
      });
    }
    return value;
  }, "normalize inquiry aliases");

const updateInquirySchema = inquiryBodySchema.min(1);

const getInquiriesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  search: Joi.string().trim().max(100).allow("").optional(),
  status: Joi.string()
    .valid(...Object.values(InquiryStatus))
    .optional(),
  caseType: Joi.string()
    .valid(...Object.values(CaseType))
    .optional(),
  sortBy: Joi.string()
    .valid(...Object.values(INQUIRY_SORT_FIELDS))
    .default(INQUIRY_SORT_FIELDS.CREATED_AT),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

const inquiryIdSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

const convertToCaseSchema = Joi.object({
  title: Joi.string().trim().min(2).max(255).optional(),
  caseType: Joi.string().trim().max(100).optional(),
  disputeCategoryId: Joi.string().uuid().optional(),
  caseManagerId: Joi.string().uuid().optional(),
  neutralUserIds: Joi.array().items(Joi.string().uuid()).optional(),
});

module.exports = {
  createInquirySchema,
  updateInquirySchema,
  getInquiriesSchema,
  inquiryIdSchema,
  convertToCaseSchema,
};
