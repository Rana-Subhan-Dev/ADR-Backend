const Joi = require("joi");

const {
  UserStatus,
  USER_SORT_FIELDS,
  ADMIN_SETTABLE_STATUSES,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} = require("../constants/user.constants");

const { RoleName } = require("../constants/auth.constants");

const getUsersSchema = Joi.object({
  page: Joi.number().integer().min(1).default(DEFAULT_PAGE),

  limit: Joi.number().integer().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),

  search: Joi.string().trim().max(100).allow("").optional(),

  role: Joi.string()
    .valid(...Object.values(RoleName))
    .optional(),

  status: Joi.string()
    .valid(...Object.values(UserStatus))
    .optional(),

  sortBy: Joi.string()
    .valid(...Object.values(USER_SORT_FIELDS))
    .default(USER_SORT_FIELDS.CREATED_AT),

  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

const userIdSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

const updateUserSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(50).optional(),

  lastName: Joi.string().trim().min(2).max(50).optional(),

  phone: Joi.string()
    .trim()
    .pattern(/^[0-9+\-\s()]+$/)
    .allow(null, "")
    .optional(),

  jobTitle: Joi.string().trim().max(100).allow(null, "").optional(),
}).min(1);

const updateUserStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...ADMIN_SETTABLE_STATUSES)
    .required(),

  reason: Joi.string().trim().max(500).allow(null, "").optional(),
});

module.exports = {
  getUsersSchema,
  userIdSchema,
  updateUserSchema,
  updateUserStatusSchema,
};
