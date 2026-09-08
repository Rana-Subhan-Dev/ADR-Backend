const Joi = require("joi");
const {
  BillingType,
  InvoiceType,
  InvoiceStatus,
  PaymentStatus,
  IntegrationSyncStatus,
  TimesheetActivityType,
} = require("@prisma/client");

const caseIdParamSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
});

const invoiceIdParamSchema = Joi.object({
  invoiceId: Joi.string().uuid().required(),
});

const caseBillingConfigSchema = Joi.object({
  billingType: Joi.string()
    .valid(...Object.values(BillingType))
    .required(),
  neutralHourlyRate: Joi.number()
    .precision(2)
    .min(0)
    .max(99999999.99)
    .allow(null)
    .optional(),
  caseManagementHourlyRate: Joi.number()
    .precision(2)
    .min(0)
    .max(99999999.99)
    .allow(null)
    .optional(),
  flatFeeAmount: Joi.number()
    .precision(2)
    .min(0)
    .max(9999999999.99)
    .allow(null)
    .optional(),
  claimantSplitPercentage: Joi.number()
    .precision(2)
    .min(0)
    .max(100)
    .allow(null)
    .optional(),
  respondentSplitPercentage: Joi.number()
    .precision(2)
    .min(0)
    .max(100)
    .allow(null)
    .optional(),
  setupFee: Joi.number()
    .precision(2)
    .min(0)
    .max(9999999999.99)
    .allow(null)
    .optional(),
  administrationFee: Joi.number()
    .precision(2)
    .min(0)
    .max(9999999999.99)
    .allow(null)
    .optional(),
  taxApplicability: Joi.boolean().default(false).optional(),
  deliveryContactEmail: Joi.string().email().allow(null, "").optional(),
  billingNotes: Joi.string().max(5000).allow(null, "").optional(),
  hasTrustAccount: Joi.boolean().default(false).optional(),
});

const listBillingConfigurationsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(100).allow("").optional(),
  billingType: Joi.string()
    .valid(...Object.values(BillingType))
    .optional(),
  status: Joi.string().valid("CONFIGURED", "INCOMPLETE").optional(),
  caseStatus: Joi.string().optional(),
  caseType: Joi.string().optional(),
  neutralUserId: Joi.string().uuid().optional(),
  payerPartyId: Joi.string().uuid().optional(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().optional(),
  sortBy: Joi.string()
    .valid("createdAt", "updatedAt", "caseNumber", "title")
    .default("createdAt"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

const listApprovedTimesheetsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(100).allow("").optional(),
  caseId: Joi.string().uuid().optional(),
  hearingId: Joi.string().uuid().optional(),
  neutralUserId: Joi.string().uuid().optional(),
  activityType: Joi.string()
    .valid(...Object.values(TimesheetActivityType))
    .optional(),
  invoiceAssociation: Joi.string()
    .valid("ALL", "DRAFT", "INVOICED", "UNASSIGNED")
    .default("ALL"),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().optional(),
  sortBy: Joi.string()
    .valid("entryDate", "hours", "createdAt")
    .default("entryDate"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

const lineItemInputSchema = Joi.object({
  description: Joi.string().trim().min(1).max(500).required(),
  quantity: Joi.number().precision(2).positive().max(999999.99).default(1),
  unitPrice: Joi.number().precision(2).min(0).max(9999999999.99).required(),
  amount: Joi.number().precision(2).min(0).max(9999999999.99).optional(),
  relatedTimesheetId: Joi.string().uuid().allow(null).optional(),
});

const generateInvoiceSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  invoiceType: Joi.string()
    .valid(...Object.values(InvoiceType))
    .required(),
  payerCasePartyId: Joi.string().uuid().allow(null).optional(),
  dueDate: Joi.date().iso().allow(null).optional(),
  specialInstructions: Joi.string().max(5000).allow(null, "").optional(),
  timesheetIds: Joi.array().items(Joi.string().uuid()).optional(),
  lineItems: Joi.array().items(lineItemInputSchema).optional(),
  amountDue: Joi.number().precision(2).min(0).max(9999999999.99).optional(),
  applySplit: Joi.boolean().default(false).optional(),
  splitPartySide: Joi.string().valid("CLAIMANT", "RESPONDENT").optional(),
});

const updateInvoiceSchema = Joi.object({
  payerCasePartyId: Joi.string().uuid().allow(null).optional(),
  dueDate: Joi.date().iso().allow(null).optional(),
  specialInstructions: Joi.string().max(5000).allow(null, "").optional(),
  lineItems: Joi.array().items(lineItemInputSchema).optional(),
  amountDue: Joi.number().precision(2).min(0).max(9999999999.99).optional(),
}).min(1);

const listInvoicesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(100).allow("").optional(),
  caseId: Joi.string().uuid().optional(),
  invoiceStatus: Joi.string()
    .valid(...Object.values(InvoiceStatus))
    .optional(),
  paymentStatus: Joi.string()
    .valid(...Object.values(PaymentStatus))
    .optional(),
  invoiceType: Joi.string()
    .valid(...Object.values(InvoiceType))
    .optional(),
  payerCasePartyId: Joi.string().uuid().optional(),
  quickBooksSyncStatus: Joi.string()
    .valid(...Object.values(IntegrationSyncStatus))
    .optional(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().optional(),
  sortBy: Joi.string()
    .valid("createdAt", "dueDate", "amountDue", "invoiceNumber")
    .default("createdAt"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

const submitForReviewSchema = Joi.object({
  reviewNotes: Joi.string().max(1000).allow(null, "").optional(),
  reviewerUserId: Joi.string().uuid().optional(),
});

const sendInvoiceSchema = Joi.object({
  recipientEmails: Joi.array().items(Joi.string().email()).min(1).required(),
  subject: Joi.string().trim().min(1).max(200).optional(),
  message: Joi.string().max(5000).allow(null, "").optional(),
  attachPdf: Joi.boolean().default(false).optional(),
});

const voidInvoiceSchema = Joi.object({
  reason: Joi.string().trim().min(1).max(1000).required(),
});

const reissueInvoiceSchema = Joi.object({
  reason: Joi.string().trim().min(1).max(1000).required(),
  dueDate: Joi.date().iso().allow(null).optional(),
  specialInstructions: Joi.string().max(5000).allow(null, "").optional(),
});

const recordPaymentSchema = Joi.object({
  amount: Joi.number().precision(2).positive().max(9999999999.99).required(),
  paymentDate: Joi.date().iso().required(),
  method: Joi.string().trim().min(1).max(100).optional(),
  referenceNumber: Joi.string().trim().max(100).allow(null, "").optional(),
  notes: Joi.string().max(1000).allow(null, "").optional(),
});

const recordCreditNoteSchema = Joi.object({
  amount: Joi.number().precision(2).positive().max(9999999999.99).required(),
  reason: Joi.string().trim().min(1).max(1000).required(),
  issuedAt: Joi.date()
    .iso()
    .default(() => new Date().toISOString()),
});

const listPaymentsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(100).allow("").optional(),
  caseId: Joi.string().uuid().optional(),
  invoiceId: Joi.string().uuid().optional(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().optional(),
  sortBy: Joi.string()
    .valid("paymentDate", "createdAt", "amount")
    .default("paymentDate"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

const listQuickBooksSyncLogsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string()
    .valid(...Object.values(IntegrationSyncStatus))
    .optional(),
  relatedRecordType: Joi.string().trim().max(50).optional(),
  search: Joi.string().trim().max(100).allow("").optional(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().optional(),
});

const retryQuickBooksSyncSchema = Joi.object({
  logIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
});

const neutralPaymentStatementSchema = Joi.object({
  neutralParticipantId: Joi.string().uuid().optional(),
  timesheetIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
  adminFeePercentage: Joi.number().precision(2).min(0).max(100).default(15.0),
  statementDate: Joi.date()
    .iso()
    .default(() => new Date().toISOString()),
  notes: Joi.string().max(1000).allow(null, "").optional(),
});

module.exports = {
  caseIdParamSchema,
  invoiceIdParamSchema,
  caseBillingConfigSchema,
  listBillingConfigurationsSchema,
  listApprovedTimesheetsSchema,
  generateInvoiceSchema,
  updateInvoiceSchema,
  listInvoicesSchema,
  submitForReviewSchema,
  sendInvoiceSchema,
  voidInvoiceSchema,
  reissueInvoiceSchema,
  recordPaymentSchema,
  recordCreditNoteSchema,
  listPaymentsSchema,
  listQuickBooksSyncLogsSchema,
  retryQuickBooksSyncSchema,
  neutralPaymentStatementSchema,
};
