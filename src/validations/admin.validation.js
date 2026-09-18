const Joi = require("joi");
const {
  RoleName,
  UserStatus,
  CaseLifecycleStatus,
  PermissionModule,
} = require("@prisma/client");

const paginationFields = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
};

const auditLogFilterFields = {
  search: Joi.string().trim().max(255).allow("").optional(),
  module: Joi.string()
    .valid(...Object.values(PermissionModule), "")
    .optional(),
  role: Joi.string()
    .valid(...Object.values(RoleName), "")
    .optional(),
  from: Joi.alternatives()
    .try(Joi.date().iso(), Joi.string().valid(""))
    .optional(),
  to: Joi.alternatives()
    .try(Joi.date().iso(), Joi.string().valid(""))
    .optional(),
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

const adminAuditLogsQuerySchema = Joi.object({
  ...paginationFields,
  ...auditLogFilterFields,
});

const adminAuditLogsExportQuerySchema = Joi.object({
  ...auditLogFilterFields,
});

module.exports = {
  dashboardQuerySchema,
  adminUsersQuerySchema,
  adminCasesQuerySchema,
  adminInvoicesQuerySchema,
  adminAuditLogsQuerySchema,
  adminAuditLogsExportQuerySchema,
};
