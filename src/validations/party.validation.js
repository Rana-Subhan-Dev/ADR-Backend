const Joi = require("joi");

const { PartyType, PartySide } = require("../constants/party.constants");

const createPartySchema = Joi.object({
  caseId: Joi.string().uuid().required(),

  partyType: Joi.string()
    .valid(...Object.values(PartyType))
    .required(),

  side: Joi.string()
    .valid(...Object.values(PartySide))
    .required(),

  firstName: Joi.string().trim().max(100).allow("", null).optional(),
  lastName: Joi.string().trim().max(100).allow("", null).optional(),
  organizationName: Joi.string().trim().max(255).allow("", null).optional(),

  email: Joi.string().email().trim().lowercase().allow("", null).optional(),
  phone: Joi.string()
    .trim()
    .pattern(/^[0-9+\-\s()]+$/)
    .max(50)
    .allow("", null)
    .optional(),

  streetAddress: Joi.string().trim().max(255).allow("", null).optional(),
  city: Joi.string().trim().max(100).allow("", null).optional(),
  state: Joi.string().trim().max(100).allow("", null).optional(),
  postalCode: Joi.string().trim().max(30).allow("", null).optional(),
  notes: Joi.string().trim().max(5000).allow("", null).optional(),
});

const getPartiesSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  search: Joi.string().trim().max(100).allow("").optional(),
  partyType: Joi.string()
    .valid(...Object.values(PartyType))
    .optional(),
  side: Joi.string()
    .valid(...Object.values(PartySide))
    .optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

const partyIdSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

const updatePartySchema = createPartySchema
  .fork(["partyType", "side"], (field) => field.optional())
  .keys({ caseId: Joi.forbidden() })
  .min(1);

module.exports = {
  createPartySchema,
  getPartiesSchema,
  partyIdSchema,
  updatePartySchema,
};
