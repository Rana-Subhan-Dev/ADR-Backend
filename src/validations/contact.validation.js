const Joi = require("joi");

const CONTACT_ROLES = ["Lawyer", "Client", "Neutral"];

const contactIdSchema = Joi.object({
  contactId: Joi.string().uuid().required(),
});

const phoneRequired = Joi.string()
  .trim()
  .pattern(/^[0-9+\-\s()]+$/)
  .max(50)
  .required();

const createContactSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(100).optional(),
  lastName: Joi.string().trim().min(1).max(100).optional(),
  name: Joi.string().trim().min(1).max(255).optional(),
  company: Joi.string().trim().max(255).allow("", null).optional(),
  email: Joi.string().email().trim().lowercase().required(),
  phone: phoneRequired,
  role: Joi.string()
    .valid(...CONTACT_ROLES)
    .required(),
  notes: Joi.string().trim().max(5000).allow("", null).optional(),
}).custom((value, helpers) => {
  if (value.firstName || value.lastName) {
    if (!value.firstName || !value.lastName) {
      return helpers.message("firstName and lastName are both required.");
    }
    return value;
  }
  if (!value.name) {
    return helpers.message("Provide firstName+lastName or name.");
  }
  return value;
});

const updateContactSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(100).optional(),
  lastName: Joi.string().trim().min(1).max(100).optional(),
  name: Joi.string().trim().min(1).max(255).optional(),
  company: Joi.string().trim().max(255).allow("", null).optional(),
  email: Joi.string().email().trim().lowercase().optional(),
  phone: Joi.string()
    .trim()
    .pattern(/^[0-9+\-\s()]+$/)
    .max(50)
    .optional(),
  role: Joi.string()
    .valid(...CONTACT_ROLES)
    .optional(),
  notes: Joi.string().trim().max(5000).allow("", null).optional(),
}).min(1);

const listContactsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(500).default(100),
  search: Joi.string().trim().max(100).allow("").optional(),
  role: Joi.string()
    .valid(...CONTACT_ROLES)
    .optional(),
  ownerUserId: Joi.string().uuid().optional(),
  mine: Joi.boolean().optional(),
});

module.exports = {
  CONTACT_ROLES,
  contactIdSchema,
  createContactSchema,
  updateContactSchema,
  listContactsSchema,
};
