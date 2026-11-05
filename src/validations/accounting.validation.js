const Joi = require("joi");
const { TimesheetActivityType } = require("@prisma/client");

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

const timesheetsListQuerySchema = Joi.object({
  search: Joi.string().trim().max(255).allow("").optional(),
  dateRange: Joi.string().valid("30", "60", "90", 30, 60, 90).optional(),
  hearingId: Joi.string().uuid().optional(),
  activityType: Joi.string()
    .valid(...Object.values(TimesheetActivityType))
    .optional(),
  status: Joi.string()
    .valid("DRAFT", "SUBMITTED", "APPROVED", "REJECTED")
    .optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

const caseIdParamSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
});

const contactCaseManagerSchema = Joi.object({
  message: Joi.string().trim().min(1).max(5000).required(),
});

const financeActivityListQuerySchema = Joi.object({
  search: Joi.string().trim().max(255).allow("").optional(),
  action: Joi.string().trim().max(100).optional(),
  actingUserId: Joi.alternatives()
    .try(Joi.string().uuid(), Joi.string().valid("SYSTEM"))
    .optional(),
  caseId: Joi.string().uuid().optional(),
  invoiceId: Joi.string().uuid().optional(),
  timesheetId: Joi.string().uuid().optional(),
  dateRange: Joi.string().valid("7", "30", "90", "365", 7, 30, 90, 365).optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

module.exports = {
  caseFinancialsListQuerySchema,
  timesheetsListQuerySchema,
  caseIdParamSchema,
  contactCaseManagerSchema,
  financeActivityListQuerySchema,
};
