const Joi = require("joi");
const {
  RepresentationDesignation,
} = require("../constants/attorneyLawFirm.constants");

const optionalText = (max) =>
  Joi.string().trim().max(max).allow("", null).optional();
const optionalPhone = Joi.string()
  .trim()
  .pattern(/^[0-9+\-\s()]+$/)
  .max(50)
  .allow("", null)
  .optional();

const createLawFirmSchema = Joi.object({
  name: Joi.string().trim().max(255).required(),
  address: optionalText(500),
  phone: optionalPhone,
  website: Joi.string().uri().trim().max(500).allow("", null).optional(),
});

const updateLawFirmSchema = createLawFirmSchema
  .keys({
    name: Joi.string().trim().max(255).optional(),
  })
  .min(1);

const lawFirmIdSchema = Joi.object({
  lawFirmId: Joi.string().uuid().required(),
});

const getLawFirmsSchema = Joi.object({
  search: Joi.string().trim().max(100).allow("").optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

const createAttorneySchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  firstName: Joi.string().trim().max(100).required(),
  lastName: Joi.string().trim().max(100).required(),
  email: Joi.string().email().trim().lowercase().allow("", null).optional(),
  phone: optionalPhone,
  lawFirmId: Joi.string().uuid().allow(null).optional(),
  representedPartyId: Joi.string().uuid().required(),
  designation: Joi.string()
    .valid(...Object.values(RepresentationDesignation))
    .required(),
});

const updateAttorneySchema = Joi.object({
  firstName: Joi.string().trim().max(100).optional(),
  lastName: Joi.string().trim().max(100).optional(),
  email: Joi.string().email().trim().lowercase().allow("", null).optional(),
  phone: optionalPhone,
  lawFirmId: Joi.string().uuid().allow(null).optional(),
}).min(1);

const attorneyIdSchema = Joi.object({
  attorneyId: Joi.string().uuid().required(),
});

const getAttorneysSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  search: Joi.string().trim().max(100).allow("").optional(),
  lawFirmId: Joi.string().uuid().optional(),
  designation: Joi.string()
    .valid(...Object.values(RepresentationDesignation))
    .optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

const attorneyDetailsSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
});

module.exports = {
  createLawFirmSchema,
  updateLawFirmSchema,
  lawFirmIdSchema,
  getLawFirmsSchema,
  createAttorneySchema,
  updateAttorneySchema,
  attorneyIdSchema,
  getAttorneysSchema,
  attorneyDetailsSchema,
};
