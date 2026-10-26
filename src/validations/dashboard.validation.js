const Joi = require("joi");

const overviewQuerySchema = Joi.object({
  upcomingHearingsLimit: Joi.number().integer().min(1).max(50).optional(),
  followUpDays: Joi.number().integer().min(1).max(365).optional(),
  followUpFrom: Joi.date().iso().optional(),
  followUpTo: Joi.date().iso().optional(),
});

const lawyerDashboardQuerySchema = Joi.object({
  hearingsLimit: Joi.number().integer().min(1).max(50).optional(),
  signaturesLimit: Joi.number().integer().min(1).max(50).optional(),
  invoicesLimit: Joi.number().integer().min(1).max(50).optional(),
  documentsLimit: Joi.number().integer().min(1).max(50).optional(),
});

module.exports = { overviewQuerySchema, lawyerDashboardQuerySchema };
