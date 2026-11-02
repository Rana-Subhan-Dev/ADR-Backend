const Joi = require("joi");

const caseFinancialsListQuerySchema = Joi.object({
  search: Joi.string().trim().max(255).allow("").optional(),
  dateRange: Joi.string().valid("30", "60", "90", 30, 60, 90).optional(),
  invoiceStatus: Joi.string()
    .valid("DRAFT", "PENDING_REVIEW", "SENT", "PAID", "VOIDED")
    .optional(),
  paymentStatus: Joi.string()
    .valid("PAID", "PARTIALLY_PAID", "UNPAID", "OVERDUE")
    .optional(),
  billingStatus: Joi.string()
    .valid("CONFIGURED", "PENDING_REVIEW", "MISSING")
    .optional(),
  timesheetStatus: Joi.string()
    .valid("PENDING_REVIEW", "APPROVED", "REJECTED")
    .optional(),
  caseManagerUserId: Joi.string().uuid().optional(),
  neutralUserId: Joi.string().uuid().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

const caseIdParamSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
});

const contactCaseManagerSchema = Joi.object({
  message: Joi.string().trim().min(1).max(5000).required(),
});

module.exports = {
  caseFinancialsListQuerySchema,
  caseIdParamSchema,
  contactCaseManagerSchema,
};
