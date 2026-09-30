const Joi = require("joi");
const {
  DocumentVisibility,
  DocumentReviewStatus,
  DocumentProcessingStatus,
  DocumentAccessAction,
} = require("@prisma/client");

const caseIdSchema = Joi.object({ caseId: Joi.string().uuid().required() });
const documentIdSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  documentId: Joi.string().uuid().required(),
});
const documentVersionIdSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  documentId: Joi.string().uuid().required(),
  versionId: Joi.string().uuid().required(),
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
  processingStatus: Joi.string()
    .valid(...Object.values(DocumentProcessingStatus))
    .optional(),
  search: Joi.string().trim().max(255).optional(),
  includeDeleted: Joi.boolean().optional(),
});
const getDocumentSchema = Joi.object({
  includeDeleted: Joi.boolean().optional(),
});
const accessLogSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  action: Joi.string()
    .valid(...Object.values(DocumentAccessAction))
    .optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
});

const listDocumentsHubSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(255).optional(),
  caseId: Joi.string().uuid().optional(),
  categoryId: Joi.string().uuid().optional(),
  category: Joi.string().trim().max(255).optional(),
  visibility: Joi.string()
    .valid(...Object.values(DocumentVisibility))
    .optional(),
  processingStatus: Joi.string()
    .valid(...Object.values(DocumentProcessingStatus))
    .optional(),
  uploadedByUserId: Joi.string().uuid().optional(),
  fileType: Joi.string().trim().max(100).optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
  includeDeleted: Joi.boolean().optional(),
});

module.exports = {
  caseIdSchema,
  documentIdSchema,
  documentVersionIdSchema,
  documentFileSchema,
  uploadVersionSchema,
  visibilitySchema,
  deleteSchema,
  listSchema,
  getDocumentSchema,
  listDocumentsHubSchema,
  accessLogSchema,
};
