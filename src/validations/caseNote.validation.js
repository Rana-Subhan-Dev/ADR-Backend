const Joi = require("joi");
const { CaseNoteType, CaseNoteVisibility } = require("@prisma/client");

const caseIdSchema = Joi.object({ caseId: Joi.string().uuid().required() });
const noteIdSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  noteId: Joi.string().uuid().required(),
});

const createCaseNoteSchema = Joi.object({
  noteType: Joi.string()
    .valid(...Object.values(CaseNoteType))
    .required(),
  visibility: Joi.string()
    .valid(...Object.values(CaseNoteVisibility))
    .default("INTERNAL_ONLY"),
  body: Joi.string().trim().min(1).max(20000).required(),
});

const updateCaseNoteSchema = Joi.object({
  visibility: Joi.string()
    .valid(...Object.values(CaseNoteVisibility))
    .optional(),
  body: Joi.string().trim().min(1).max(20000).optional(),
}).min(1);

const getCaseNotesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  noteType: Joi.string()
    .valid(...Object.values(CaseNoteType))
    .optional(),
  visibility: Joi.string()
    .valid(...Object.values(CaseNoteVisibility))
    .optional(),
  authorUserId: Joi.string().uuid().optional(),
});

module.exports = {
  caseIdSchema,
  noteIdSchema,
  createCaseNoteSchema,
  updateCaseNoteSchema,
  getCaseNotesSchema,
};
