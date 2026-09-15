const Joi = require("joi");
const { DocuSignEnvelopeStatus } = require("@prisma/client");

const caseIdSchema = Joi.object({ caseId: Joi.string().uuid().required() });
const envelopeRecordIdSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  envelopeRecordId: Joi.string().uuid().required(),
});

const recipientSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  role: Joi.string().trim().max(100).allow("", null).optional(),
  email: Joi.string().email().max(255).required(),
  routingOrder: Joi.number().integer().min(1).max(100).optional(),
  caseParticipantId: Joi.string().uuid().optional(),
  attorneyId: Joi.string().uuid().optional(),
  casePartyId: Joi.string().uuid().optional(),
})
  .custom((value, helpers) =>
    [value.caseParticipantId, value.attorneyId, value.casePartyId].filter(
      Boolean,
    ).length > 1
      ? helpers.error("any.invalid")
      : value,
  )
  .messages({
    "any.invalid": "A recipient can reference only one case record.",
  });

const sendEnvelopeSchema = Joi.object({
  sourceDocumentId: Joi.string().uuid().required(),
  templateId: Joi.string().trim().max(255).allow("", null).optional(),
  templateName: Joi.string().trim().max(255).allow("", null).optional(),
  emailSubject: Joi.string().trim().max(500).allow("", null).optional(),
  dueDate: Joi.date().iso().allow(null).optional(),
  recipients: Joi.array().items(recipientSchema).min(1).max(100).required(),
});

const listEnvelopesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string()
    .valid(...Object.values(DocuSignEnvelopeStatus))
    .optional(),
  mine: Joi.boolean().truthy("true").falsy("false").optional(),
});

const recipientViewSchema = Joi.object({
  returnUrl: Joi.string().uri().max(2000).optional(),
});

module.exports = {
  caseIdSchema,
  envelopeRecordIdSchema,
  sendEnvelopeSchema,
  listEnvelopesSchema,
  recipientViewSchema,
};
