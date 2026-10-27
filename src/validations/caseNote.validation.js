const Joi = require("joi");
const { CaseNoteType, CaseNoteVisibility } = require("@prisma/client");

const RELATED_RECORD_TYPES = ["Document", "Hearing"];

const caseIdSchema = Joi.object({ caseId: Joi.string().uuid().required() });
const noteIdSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  noteId: Joi.string().uuid().required(),
});

const relatedRecordFields = {
  relatedRecordType: Joi.string()
    .valid(...RELATED_RECORD_TYPES)
    .allow(null)
    .optional(),
  relatedRecordId: Joi.string().uuid().allow(null).optional(),
};

const createCaseNoteSchema = Joi.object({
  noteType: Joi.string()
    .valid(...Object.values(CaseNoteType))
    .required(),
  visibility: Joi.string()
    .valid(...Object.values(CaseNoteVisibility))
    .default("INTERNAL_ONLY"),
  body: Joi.string().trim().min(1).max(20000).required(),
  ...relatedRecordFields,
})
  .with("relatedRecordType", "relatedRecordId")
  .with("relatedRecordId", "relatedRecordType");

const updateCaseNoteSchema = Joi.object({
  visibility: Joi.string()
    .valid(...Object.values(CaseNoteVisibility))
    .optional(),
  body: Joi.string().trim().min(1).max(20000).optional(),
  ...relatedRecordFields,
})
  .min(1)
  .with("relatedRecordType", "relatedRecordId")
  .with("relatedRecordId", "relatedRecordType");

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
  parentNoteId: Joi.string().uuid().optional(),
  /** When true, include reply notes in the list. Default is root notes only. */
  includeReplies: Joi.boolean().default(false),
  relatedRecordType: Joi.string()
    .valid(...RELATED_RECORD_TYPES)
    .optional(),
});

const replyCaseNoteSchema = Joi.object({
  body: Joi.string().trim().min(1).max(20000).required(),
  alsoPostAsCaseUpdate: Joi.boolean().default(false),
  visibility: Joi.string()
    .valid("ALL_PARTICIPANTS", "INTERNAL_ONLY")
    .default("ALL_PARTICIPANTS"),
});

module.exports = {
  caseIdSchema,
  noteIdSchema,
  createCaseNoteSchema,
  updateCaseNoteSchema,
  getCaseNotesSchema,
  replyCaseNoteSchema,
  RELATED_RECORD_TYPES,
};
