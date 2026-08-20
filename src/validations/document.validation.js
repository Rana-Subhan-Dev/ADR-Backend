const Joi = require("joi");
const { DocumentVisibility, DocumentReviewStatus } = require("@prisma/client");

const caseIdSchema = Joi.object({ caseId: Joi.string().uuid().required() });
const documentIdSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  documentId: Joi.string().uuid().required(),
});
const documentFileSchema = Joi.object({
  name: Joi.string().trim().max(255).optional(),
  description: Joi.string().trim().max(20000).allow("", null).optional(),
  categoryId: Joi.string().uuid().allow(null).optional(),
  tags: Joi.array()
    .items(Joi.string().trim().min(1).max(100))
    .max(20)
    .unique()
    .default([]),
  visibility: Joi.string()
    .valid(...Object.values(DocumentVisibility))
    .default("INTERNAL_ONLY"),
  recipientParticipantIds: Joi.array()
    .items(Joi.string().uuid())
    .max(100)
    .unique()
    .default([]),
  notifyParticipants: Joi.boolean().default(false),
});
const uploadVersionSchema = Joi.object({
  changesNotes: Joi.string().trim().max(20000).allow("", null).optional(),
  notifyParticipants: Joi.boolean().default(false),
});
const visibilitySchema = Joi.object({
  visibility: Joi.string()
    .valid(...Object.values(DocumentVisibility))
    .required(),
  recipientParticipantIds: Joi.array()
    .items(Joi.string().uuid())
    .max(100)
    .unique()
    .default([]),
  reason: Joi.string().trim().max(1000).allow("", null).optional(),
});
const deleteSchema = Joi.object({
  reason: Joi.string().trim().max(1000).allow("", null).optional(),
});
const listSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  categoryId: Joi.string().uuid().optional(),
  visibility: Joi.string()
    .valid(...Object.values(DocumentVisibility))
    .optional(),
  reviewStatus: Joi.string()
    .valid(...Object.values(DocumentReviewStatus))
    .optional(),
  search: Joi.string().trim().max(255).optional(),
});
const accessLogSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = {
  caseIdSchema,
  documentIdSchema,
  documentFileSchema,
  uploadVersionSchema,
  visibilitySchema,
  deleteSchema,
  listSchema,
  accessLogSchema,
};
