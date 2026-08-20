const Joi = require("joi");
const {
  RepresentationDesignation,
} = require("../constants/representation.constants");

const createRepresentationSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  casePartyId: Joi.string().uuid().required(),
  attorneyId: Joi.string().uuid().required(),
  role: Joi.string()
    .valid(...Object.values(RepresentationDesignation))
    .required(),
});

const updateRepresentationSchema = Joi.object({
  role: Joi.string()
    .valid(...Object.values(RepresentationDesignation))
    .required(),
});

const representationIdSchema = Joi.object({
  representationId: Joi.string().uuid().required(),
});

const getRepresentationsSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  casePartyId: Joi.string().uuid().optional(),
  attorneyId: Joi.string().uuid().optional(),
  role: Joi.string()
    .valid(...Object.values(RepresentationDesignation))
    .optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

module.exports = {
  createRepresentationSchema,
  updateRepresentationSchema,
  representationIdSchema,
  getRepresentationsSchema,
};
