const Joi = require("joi");
const { CaseType, CaseLifecycleStatus } = require("@prisma/client");

const reportIdSchema = Joi.object({
  reportId: Joi.string().trim().min(1).max(100).required(),
});

const reportCatalogueQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(100),
  search: Joi.string().trim().max(255).allow("").optional(),
  category: Joi.string().trim().max(100).allow("").optional(),
  dataset: Joi.string().trim().max(100).allow("").optional(),
  reportType: Joi.string().trim().max(100).allow("").optional(),
  dateFrom: Joi.date().iso().allow("").optional(),
  dateTo: Joi.date().iso().allow("").optional(),
});

const reportQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(255).allow("").optional(),
  dateFrom: Joi.date().iso().allow("").optional(),
  dateTo: Joi.date().iso().allow("").optional(),
  fromDate: Joi.date().iso().allow("").optional(),
  toDate: Joi.date().iso().allow("").optional(),
  caseType: Joi.string()
    .trim()
    .uppercase()
    .valid(...Object.values(CaseType), "")
    .optional(),
  caseStatus: Joi.string()
    .trim()
    .uppercase()
    .valid(...Object.values(CaseLifecycleStatus), "")
    .optional(),
  lifecycleStatus: Joi.string()
    .trim()
    .uppercase()
    .valid(...Object.values(CaseLifecycleStatus), "")
    .optional(),
  neutralUserId: Joi.string().uuid().optional(),
  caseManagerUserId: Joi.string().uuid().optional(),
  disputeType: Joi.string().trim().max(200).optional(),
  state: Joi.string().trim().max(100).allow("").optional(),
  role: Joi.string().trim().max(100).allow("").optional(),
  paymentStatus: Joi.string().valid("UNPAID", "PARTIAL", "PAID").optional(),
  agingBucket: Joi.string()
    .valid("current", "1-30", "31-60", "61-90", "90+")
    .optional(),
});

module.exports = {
  reportIdSchema,
  reportCatalogueQuerySchema,
  reportQuerySchema,
};
