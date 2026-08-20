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

const createInquirySchema = Joi.object({
  inquiryDate: Joi.date().iso().required(),

  matterName: Joi.string().trim().min(2).max(255).required(),

  initialContactName: Joi.string().trim().min(2).max(255).required(),

  inquiryContactType: Joi.string().trim().max(100).allow("", null).optional(),

  fromFirm: Joi.string().trim().max(255).allow("", null).optional(),

  counselFor: Joi.string()
    .valid(...Object.values(PartySide))
    .optional(),

  contactEmail: Joi.string()
    .email()
    .trim()
    .lowercase()
    .allow("", null)
    .optional(),

  contactPhone: Joi.string()
    .trim()
    .pattern(/^[0-9+\-\s()]+$/)
    .allow("", null)
    .optional(),

  caseType: Joi.string()
    .valid(...Object.values(CaseType))
    .optional(),

  disputeCategoryId: Joi.string().uuid().optional(),

  locationJurisdiction: Joi.string().trim().max(255).allow("", null).optional(),

  daysRequested: Joi.number().integer().min(0).optional(),

  timeFrameRequested: Joi.string().trim().max(255).allow("", null).optional(),

  sourceOfInquiry: Joi.string().trim().max(255).allow("", null).optional(),

  referredBy: Joi.string().trim().max(255).allow("", null).optional(),

  comments: Joi.string().trim().max(5000).allow("", null).optional(),

  isInternational: Joi.boolean().optional(),

  isDraft: Joi.boolean().optional(),

  preliminaryCaseManagerId: Joi.string().uuid().allow(null).optional(),
});

const updateInquirySchema = createInquirySchema
  .fork(["inquiryDate", "matterName", "initialContactName"], (field) =>
    field.optional(),
  )
  .min(1);

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

  caseType: Joi.string()
    .valid(...Object.values(CaseType))
    .optional(),

  disputeCategoryId: Joi.string().uuid().optional(),

  caseManagerId: Joi.string().uuid().optional(),
});

module.exports = {
  createInquirySchema,
  updateInquirySchema,
  getInquiriesSchema,
  inquiryIdSchema,
  convertToCaseSchema,
};
