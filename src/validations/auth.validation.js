const Joi = require("joi");

const { INVITABLE_ROLES, UserType } = require("../constants/auth.constants");

const passwordSchema = Joi.string()
  .min(8)
  .max(32)
  .pattern(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.#])[A-Za-z\d@$!%*?&.#]+$/
  )
  .required()
  .messages({
    "string.min": "Password must be at least 8 characters long.",
    "string.max": "Password cannot exceed 32 characters.",
    "string.pattern.base":
      "Password must contain uppercase, lowercase, number and special character.",
  });

const phoneSchema = Joi.string()
  .trim()
  .pattern(/^[0-9+\-\s()]+$/)
  .allow(null, "")
  .optional();

const inviteUserSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),

  jobTitle: Joi.string().trim().max(100).allow(null, "").optional(),

  userType: Joi.string()
    .valid(...Object.values(UserType))
    .required(),

  roleName: Joi.string()
    .valid(...INVITABLE_ROLES)
    .required(),
});

const acceptInvitationSchema = Joi.object({
  token: Joi.string().trim().required(),

  firstName: Joi.string().trim().min(2).max(50).required(),

  lastName: Joi.string().trim().min(2).max(50).required(),

  phone: phoneSchema,

  password: passwordSchema,

  confirmPassword: Joi.string()
    .valid(Joi.ref("password"))
    .required()
    .messages({ "any.only": "Passwords do not match." }),
});

const signInSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),

  password: Joi.string().required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().trim().required(),

  password: passwordSchema,
});

module.exports = {
  inviteUserSchema,
  acceptInvitationSchema,
  signInSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
