const Joi = require("joi");

const reportIdSchema = Joi.object({
  reportId: Joi.string().trim().min(1).max(100).required(),
});

const reportQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(255).allow("").optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().optional(),
  caseType: Joi.string().trim().max(100).optional(),
  caseStatus: Joi.string().trim().max(100).optional(),
  lifecycleStatus: Joi.string().trim().max(100).optional(),
  neutralUserId: Joi.string().uuid().optional(),
  caseManagerUserId: Joi.string().uuid().optional(),
  disputeType: Joi.string().trim().max(200).optional(),
  paymentStatus: Joi.string()
    .valid("UNPAID", "PARTIAL", "PAID")
    .optional(),
  agingBucket: Joi.string()
    .valid("current", "1-30", "31-60", "61-90", "90+")
    .optional(),
});

module.exports = {
  reportIdSchema,
  reportQuerySchema,
};
