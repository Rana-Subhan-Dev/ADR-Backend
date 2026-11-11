const Joi = require("joi");
const {
  TimesheetActivityType,
  TimesheetStatus,
  TimesheetApprovalStatus,
  TimesheetExpenseType,
} = require("@prisma/client");

const caseIdSchema = Joi.object({ caseId: Joi.string().uuid().required() });
const timesheetIdSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  timesheetId: Joi.string().uuid().required(),
});
const expenseIdSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  timesheetId: Joi.string().uuid().required(),
  expenseId: Joi.string().uuid().required(),
});
const expenseReceiptSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  timesheetId: Joi.string().uuid().required(),
  expenseId: Joi.string().uuid().required(),
  documentId: Joi.string().uuid().required(),
});

const expenseItemSchema = Joi.object({
  expenseType: Joi.string()
    .valid(...Object.values(TimesheetExpenseType))
    .required(),
  expenseDate: Joi.date().iso().required(),
  amount: Joi.number().positive().precision(2).max(9999999999.99).required(),
  description: Joi.string().trim().max(4000).allow("", null).optional(),
  receiptDocumentIds: Joi.array()
    .items(Joi.string().uuid())
    .max(10)
    .unique()
    .optional()
    .default([]),
});

const createTimesheetSchema = Joi.object({
  neutralUserId: Joi.string().uuid().optional(),
  hearingId: Joi.string().uuid().allow(null).optional(),
  activityType: Joi.string()
    .valid(...Object.values(TimesheetActivityType))
    .required(),
  hours: Joi.number().positive().precision(2).max(9999.99).required(),
  entryDate: Joi.date().iso().required(),
  billingNotes: Joi.string().trim().max(10000).allow("", null).optional(),
  expenses: Joi.array().items(expenseItemSchema).max(50).optional(),
});

const updateTimesheetSchema = Joi.object({
  hearingId: Joi.string().uuid().allow(null).optional(),
  activityType: Joi.string()
    .valid(...Object.values(TimesheetActivityType))
    .optional(),
  hours: Joi.number().positive().precision(2).max(9999.99).optional(),
  entryDate: Joi.date().iso().optional(),
  billingNotes: Joi.string().trim().max(10000).allow("", null).optional(),
  expenses: Joi.array().items(expenseItemSchema).max(50).optional(),
}).min(1);

const createExpenseSchema = expenseItemSchema;
const updateExpenseSchema = Joi.object({
  expenseType: Joi.string()
    .valid(...Object.values(TimesheetExpenseType))
    .optional(),
  expenseDate: Joi.date().iso().optional(),
  amount: Joi.number().positive().precision(2).max(9999999999.99).optional(),
  description: Joi.string().trim().max(4000).allow("", null).optional(),
  receiptDocumentIds: Joi.array()
    .items(Joi.string().uuid())
    .max(10)
    .unique()
    .optional(),
}).min(1);

const attachReceiptSchema = Joi.object({
  documentId: Joi.string().uuid().required(),
});

const listTimesheetsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  neutralUserId: Joi.string().uuid().optional(),
  caseId: Joi.string().uuid().optional(),
  hearingId: Joi.string().uuid().optional(),
  activityType: Joi.string()
    .valid(...Object.values(TimesheetActivityType))
    .optional(),
  status: Joi.string()
    .valid(...Object.values(TimesheetStatus), "APPROVED", "REJECTED")
    .optional(),
  approvalStatus: Joi.string()
    .valid(...Object.values(TimesheetApprovalStatus))
    .optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  workDateFrom: Joi.date().iso().optional(),
  workDateTo: Joi.date().iso().optional(),
  entryDateFrom: Joi.date().iso().optional(),
  entryDateTo: Joi.date().iso().optional(),
  sortBy: Joi.string()
    .valid("entryDate", "hours", "activityType", "status", "createdAt")
    .optional(),
  sortOrder: Joi.string().valid("asc", "desc").optional(),
})
  .custom((value, helpers) => {
    const from =
      value.workDateFrom || value.entryDateFrom || value.from || null;
    const to = value.workDateTo || value.entryDateTo || value.to || null;
    if (from && to && new Date(to) < new Date(from)) {
      return helpers.error("any.invalid");
    }
    return value;
  })
  .messages({ "any.invalid": "to must be later than from." });

const paymentStatusQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  workDateFrom: Joi.date().iso().optional(),
  workDateTo: Joi.date().iso().optional(),
  paymentStatus: Joi.string()
    .valid("PAID", "PENDING", "AWAITING_APPROVAL", "NOT_AVAILABLE")
    .optional(),
})
  .custom((value, helpers) =>
    value.workDateFrom &&
    value.workDateTo &&
    new Date(value.workDateTo) < new Date(value.workDateFrom)
      ? helpers.error("any.invalid")
      : value,
  )
  .messages({ "any.invalid": "workDateTo must be later than workDateFrom." });

const reviewTimesheetSchema = Joi.object({
  approvalStatus: Joi.string().valid("APPROVED", "REJECTED").required(),
  rejectionComment: Joi.string()
    .trim()
    .min(1)
    .max(2000)
    .when("approvalStatus", {
      is: "REJECTED",
      then: Joi.required(),
      otherwise: Joi.optional().allow("", null),
    }),
});

module.exports = {
  caseIdSchema,
  timesheetIdSchema,
  expenseIdSchema,
  expenseReceiptSchema,
  createTimesheetSchema,
  updateTimesheetSchema,
  createExpenseSchema,
  updateExpenseSchema,
  attachReceiptSchema,
  listTimesheetsSchema,
  paymentStatusQuerySchema,
  reviewTimesheetSchema,
};
