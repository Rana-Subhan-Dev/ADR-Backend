const Joi = require("joi");
const {
  RoleName,
  UserStatus,
  CaseLifecycleStatus,
} = require("@prisma/client");

const paginationFields = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};

const dashboardQuerySchema = Joi.object({
  invoicePeriod: Joi.string().valid("monthly", "yearly").default("monthly"),
});

const adminUsersQuerySchema = Joi.object({
  ...paginationFields,
  search: Joi.string().trim().max(255).allow("").optional(),
  role: Joi.string()
    .valid(...Object.values(RoleName), "")
    .optional(),
  status: Joi.string()
    .valid(...Object.values(UserStatus), "")
    .optional(),
});

const adminCasesQuerySchema = Joi.object({
  ...paginationFields,
  search: Joi.string().trim().max(255).allow("").optional(),
  status: Joi.string()
    .valid(
      "ANY",
      "ACTIVE",
      "PENDING",
      "ON_HOLD",
      "CLOSED",
      "",
      ...Object.values(CaseLifecycleStatus),
    )
    .optional(),
});

const adminInvoicesQuerySchema = Joi.object({
  ...paginationFields,
  search: Joi.string().trim().max(255).allow("").optional(),
  status: Joi.string()
    .valid("ANY", "OUTSTANDING", "PAID", "OVERDUE", "")
    .optional(),
});

module.exports = {
  dashboardQuerySchema,
  adminUsersQuerySchema,
  adminCasesQuerySchema,
  adminInvoicesQuerySchema,
};
