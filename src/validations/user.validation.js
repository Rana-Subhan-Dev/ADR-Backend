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

  company: Joi.string().trim().max(200).allow(null, "").optional(),

  bookList: Joi.boolean().optional(),
}).min(1);

const updateMeSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(100).optional(),

  lastName: Joi.string().trim().min(2).max(100).optional(),

  prefix: Joi.string().trim().max(50).allow(null, "").optional(),
  informalName: Joi.string().trim().max(100).allow(null, "").optional(),

  phone: Joi.string()
    .trim()
    .pattern(/^[0-9+\-\s()]+$/)
    .allow(null, "")
    .optional(),

  mobile: Joi.string()
    .trim()
    .pattern(/^[0-9+\-\s()]+$/)
    .allow(null, "")
    .optional(),

  jobTitle: Joi.string().trim().max(100).allow(null, "").optional(),

  company: Joi.string().trim().max(200).allow(null, "").optional(),

  bookList: Joi.boolean().optional(),

  assistant: Joi.object({
    name: Joi.string().trim().max(200).allow(null, "").optional(),
    email: Joi.string().email().allow(null, "").optional(),
    phone: Joi.string().trim().max(50).allow(null, "").optional(),
    title: Joi.string().trim().max(100).allow(null, "").optional(),
  })
    .allow(null)
    .optional(),
}).min(1);

const updateBioSchema = Joi.object({
  education: Joi.array()
    .items(
      Joi.object({
        // FE may send client-generated keys (not only UUIDs)
        id: Joi.string().trim().max(100).allow(null, "").optional(),
        degree: Joi.string().trim().max(200).allow("").required(),
        institution: Joi.string().trim().max(200).allow("").required(),
        graduationYear: Joi.alternatives()
          .try(Joi.number().integer().min(1900).max(2100), Joi.string().trim().max(10))
          .allow(null, "")
          .optional(),
      }).unknown(true),
    )
    .max(50)
    .optional(),
  areasOfExpertise: Joi.array().items(Joi.string().trim().max(100)).max(100).optional(),
  specialties: Joi.array().items(Joi.string().trim().max(100)).max(100).optional(),
  licensedStates: Joi.array().items(Joi.string().trim().max(100)).max(100).optional(),
  languages: Joi.array().items(Joi.string().trim().max(100)).max(100).optional(),
  notes: Joi.array()
    .items(
      Joi.alternatives().try(
        Joi.string().trim().max(5000),
        Joi.object({
          id: Joi.string().trim().max(100).allow(null, "").optional(),
          // FE sends `text`; `body` kept as alias
          text: Joi.string().trim().max(5000).allow("").optional(),
          body: Joi.string().trim().max(5000).allow("").optional(),
        })
          .or("text", "body")
          .unknown(true),
      ),
    )
    .max(100)
    .optional(),
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
  updateMeSchema,
  updateBioSchema,
  updateUserStatusSchema,
};
