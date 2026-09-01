const Joi = require("joi");

const {
  CASE_SORT_FIELDS,
  CaseType,
  CaseLifecycleStatus,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} = require("../constants/case.constants");

const createCaseSchema = Joi.object({
  title: Joi.string().trim().min(2).max(255).required(),

  caseType: Joi.string()
    .valid(...Object.values(CaseType))
    .required(),

  disputeCategoryId: Joi.string().uuid().optional(),

  jurisdiction: Joi.string().trim().max(255).allow("", null).optional(),

  isInternational: Joi.boolean().optional(),

  caseManagerId: Joi.string().uuid().required(),
});

const getCasesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(DEFAULT_PAGE),

  limit: Joi.number().integer().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),

  search: Joi.string().trim().max(100).allow("").optional(),

  caseType: Joi.string()
    .valid(...Object.values(CaseType))
    .optional(),

  disputeCategoryId: Joi.string().uuid().optional(),

  lifecycleStatus: Joi.string()
    .valid(...Object.values(CaseLifecycleStatus))
    .optional(),

  caseManagerId: Joi.string().uuid().optional(),

  sortBy: Joi.string()
    .valid(...Object.values(CASE_SORT_FIELDS))
    .default(CASE_SORT_FIELDS.CREATED_AT),

  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

const caseIdSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

const updateCaseSchema = Joi.object({
  title: Joi.string().trim().min(2).max(255).optional(),

  caseType: Joi.string()
    .valid(...Object.values(CaseType))
    .optional(),

  disputeCategoryId: Joi.string().uuid().optional(),

  jurisdiction: Joi.string().trim().max(255).allow("", null).optional(),

  isInternational: Joi.boolean().optional(),

  caseManagerId: Joi.string().uuid().optional(),
}).min(1);

const updateCaseStatusSchema = Joi.object({
  lifecycleStatus: Joi.string()
    .valid(...Object.values(CaseLifecycleStatus))
    .required(),
});

const closeCaseSchema = Joi.object({
  closeDate: Joi.date().iso().required(),
  closureSummary: Joi.string().trim().min(1).required(),
});

const reopenCaseSchema = Joi.object({
  reopenReason: Joi.string().trim().min(1).required(),
});

module.exports = {
  createCaseSchema,
  getCasesSchema,
  caseIdSchema,
  updateCaseSchema,
  updateCaseStatusSchema,
  closeCaseSchema,
  reopenCaseSchema,
};
