const Joi = require("joi");

const SEARCH_WINDOWS = ["LAST_5_YEARS", "ALL_RECORDS"];

const nameArraySchema = Joi.array()
  .items(Joi.string().trim().min(1).max(255))
  .max(100)
  .default([]);

const createConflictsCheckSchema = Joi.object({
  neutralUserId: Joi.string().uuid().required(),
  matterName: Joi.string().trim().max(500).allow("", null).optional(),
  searchWindow: Joi.string()
    .valid(...SEARCH_WINDOWS)
    .default("LAST_5_YEARS"),
  parties: nameArraySchema,
  counsel: nameArraySchema,
  lawFirms: nameArraySchema,
  otherParticipants: nameArraySchema,
});

const listConflictsChecksSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  neutralUserId: Joi.string().uuid().optional(),
});

const conflictsCheckIdSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

module.exports = {
  SEARCH_WINDOWS,
  createConflictsCheckSchema,
  listConflictsChecksSchema,
  conflictsCheckIdSchema,
};
