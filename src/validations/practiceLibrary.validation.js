const Joi = require("joi");

const listPracticeLibrarySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50),
  parentId: Joi.string().uuid().allow(null).optional(),
  search: Joi.string().trim().max(255).allow("").optional(),
  sortBy: Joi.string().valid("name", "updatedAt").optional(),
  sortOrder: Joi.string().valid("asc", "desc").optional(),
});

const practiceLibraryIdSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

const createPracticeLibrarySchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).optional(),
  description: Joi.string().trim().max(5000).allow("", null).optional(),
  itemType: Joi.string().valid("FOLDER", "FILE").optional(),
  parentId: Joi.string().uuid().allow(null, "").optional(),
  sortOrder: Joi.number().integer().min(0).optional(),
  isPublished: Joi.alternatives()
    .try(Joi.boolean(), Joi.string().valid("true", "false"))
    .optional(),
});

module.exports = {
  listPracticeLibrarySchema,
  practiceLibraryIdSchema,
  createPracticeLibrarySchema,
};
