const Joi = require("joi");
const {
  BillingType,
  BillingInputSource,
  BillingMode,
  TravelTimeRateType,
  BillingExpensesPolicy,
  CaseType,
  InvoiceType,
  InvoiceStatus,
  PaymentStatus,
  IntegrationSyncStatus,
  TimesheetActivityType,
  InvoiceAttachmentType,
} = require("@prisma/client");

const caseIdParamSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
});

const invoiceIdParamSchema = Joi.object({
  invoiceId: Joi.string().uuid().required(),
});

const moneySchema = Joi.number()
  .precision(2)
  .min(0)
  .max(9999999999.99)
  .allow(null);

const rateSchema = Joi.number()
  .precision(2)
  .min(0)
  .max(99999999.99)
  .allow(null);

const percentSchema = Joi.number().precision(2).min(0).max(100).allow(null);

const payerSplitSchema = Joi.object({
  casePartyId: Joi.string().uuid().required(),
  invoiceContactEmail: Joi.string().email().allow(null, "").optional(),
  invoiceContactName: Joi.string().trim().max(200).allow(null, "").optional(),
  splitPercentage: Joi.number().precision(2).min(0).max(100).required(),
});

const additionalTimekeeperSchema = Joi.object({
  role: Joi.string().trim().min(1).max(100).required(),
  hourlyRate: Joi.number().precision(2).min(0).max(99999999.99).required(),
  expensesAllowed: Joi.string()
    .valid(...Object.values(BillingExpensesPolicy))
    .default(BillingExpensesPolicy.NOT_ALLOWED)
    .optional(),
});

const caseBillingConfigSchema = Joi.object({
  billingType: Joi.string()
    .valid(...Object.values(BillingType))
    .required(),
  billingInputSource: Joi.string()
    .valid(...Object.values(BillingInputSource))
    .default(BillingInputSource.FIRM_INVOICE)
    .optional(),
  billingMode: Joi.string()
    .valid(...Object.values(BillingMode))
    .default(BillingMode.DEPOSIT_BASED)
    .optional(),
  neutralHourlyRate: rateSchema.optional(),
  neutralDailyRate: rateSchema.optional(),
  caseManagementHourlyRate: rateSchema.optional(),
  flatFeeAmount: moneySchema.optional(),
  includedHearingDays: Joi.number().integer().min(0).max(365).allow(null).optional(),
  includedPrePostHearingHours: Joi.number()
    .precision(2)
    .min(0)
    .max(9999.99)
    .allow(null)
    .optional(),
  overageHourlyRate: rateSchema.optional(),
  additionalDayRate: rateSchema.optional(),
  customRate: moneySchema.optional(),
  customRateDescription: Joi.string().trim().max(500).allow(null, "").optional(),
  expensesPolicy: Joi.string()
    .valid(...Object.values(BillingExpensesPolicy))
    .allow(null)
    .optional(),
  travelTimeRateType: Joi.string()
    .valid(...Object.values(TravelTimeRateType))
    .default(TravelTimeRateType.FREE)
    .optional(),
  travelTimeCustomHourlyRate: rateSchema.optional(),
  splitBillingEnabled: Joi.boolean().default(false).optional(),
  roundingResidualCasePartyId: Joi.string().uuid().allow(null).optional(),
  payerSplits: Joi.array().items(payerSplitSchema).max(20).optional(),
  additionalTimekeepers: Joi.array()
    .items(additionalTimekeeperSchema)
    .max(50)
    .optional(),
  setupFee: moneySchema.optional(),
  administrationFee: moneySchema.optional(),
  adminFeePercentage: percentSchema.optional(),
  agreementFeePercentage: percentSchema.optional(),
  fedArbFeeScheduleType: Joi.string()
    .valid(...Object.values(CaseType))
    .allow(null)
    .optional(),
  taxApplicability: Joi.boolean().default(false).optional(),
  deliveryContactEmail: Joi.string().email().allow(null, "").optional(),
  billingNotes: Joi.string().max(5000).allow(null, "").optional(),
  accountingAuditComplete: Joi.boolean().default(false).optional(),
  hasTrustAccount: Joi.boolean().default(false).optional(),
})
  .custom((value, helpers) => {
    if (value.splitBillingEnabled && Array.isArray(value.payerSplits)) {
      const total = value.payerSplits.reduce(
        (sum, row) => sum + Number(row.splitPercentage || 0),
        0,
      );
      if (Math.abs(total - 100) > 0.01) {
        return helpers.message(
          "Split percentages must total exactly 100% when split billing is enabled.",
        );
      }
      if (
        value.roundingResidualCasePartyId &&
        !value.payerSplits.some(
          (row) => row.casePartyId === value.roundingResidualCasePartyId,
        )
      ) {
        return helpers.message(
          "Rounding residual payer must be one of the configured payer splits.",
        );
      }
    }
    if (
      value.travelTimeRateType === TravelTimeRateType.CUSTOM_HOURLY &&
      (value.travelTimeCustomHourlyRate === undefined ||
        value.travelTimeCustomHourlyRate === null)
    ) {
      return helpers.message(
        "travelTimeCustomHourlyRate is required when travel time uses a custom hourly rate.",
      );
    }
    return value;
  });

const listBillingConfigurationsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().max(100).allow("").optional(),
  billingType: Joi.string()
    .valid(...Object.values(BillingType))
    .optional(),
  billingInputSource: Joi.string()
    .valid(...Object.values(BillingInputSource))
    .optional(),
  billingMode: Joi.string()
    .valid(...Object.values(BillingMode))
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
  secondaryDescription: Joi.string().trim().max(1000).allow(null, "").optional(),
  quantity: Joi.number().precision(2).positive().max(999999.99).default(1),
  unitPrice: Joi.number().precision(2).min(0).max(9999999999.99).required(),
  amount: Joi.number().precision(2).min(0).max(9999999999.99).optional(),
  serviceDate: Joi.date().iso().allow(null).optional(),
  referenceCode: Joi.string().trim().max(100).allow(null, "").optional(),
  sourceLabel: Joi.string().trim().max(200).allow(null, "").optional(),
  relatedTimesheetId: Joi.string().uuid().allow(null).optional(),
});

const attachmentInputSchema = Joi.object({
  documentId: Joi.string().uuid().required(),
  attachmentType: Joi.string()
    .valid(...Object.values(InvoiceAttachmentType))
    .required(),
  isSelected: Joi.boolean().default(true).optional(),
});

const generateInvoiceSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  invoiceType: Joi.string()
    .valid(...Object.values(InvoiceType))
    .required(),
  billingInputSource: Joi.string()
    .valid(...Object.values(BillingInputSource))
    .optional(),
  payerCasePartyId: Joi.string().uuid().allow(null).optional(),
  payerCasePartyIds: Joi.array().items(Joi.string().uuid()).optional(),
  dueDate: Joi.date().iso().allow(null).optional(),
  invoiceDate: Joi.date().iso().allow(null).optional(),
  billingPeriodStart: Joi.date().iso().allow(null).optional(),
  billingPeriodEnd: Joi.date().iso().allow(null).optional(),
  firmInvoiceNumber: Joi.string().trim().max(100).allow(null, "").optional(),
  firmInvoiceDate: Joi.date().iso().allow(null).optional(),
  firmInvoiceAmount: moneySchema.optional(),
  firmExpensesAmount: moneySchema.optional(),
  clientBillingRef: Joi.string().trim().max(100).allow(null, "").optional(),
  taxRate: percentSchema.optional(),
  notes: Joi.string().max(5000).allow(null, "").optional(),
  specialInstructions: Joi.string().max(5000).allow(null, "").optional(),
  timesheetIds: Joi.array().items(Joi.string().uuid()).optional(),
  lineItems: Joi.array().items(lineItemInputSchema).optional(),
  attachments: Joi.array().items(attachmentInputSchema).max(50).optional(),
  amountDue: Joi.number().precision(2).min(0).max(9999999999.99).optional(),
});

const updateInvoiceSchema = Joi.object({
  payerCasePartyId: Joi.string().uuid().allow(null).optional(),
  dueDate: Joi.date().iso().allow(null).optional(),
  invoiceDate: Joi.date().iso().allow(null).optional(),
  billingPeriodStart: Joi.date().iso().allow(null).optional(),
  billingPeriodEnd: Joi.date().iso().allow(null).optional(),
  firmInvoiceNumber: Joi.string().trim().max(100).allow(null, "").optional(),
  firmInvoiceDate: Joi.date().iso().allow(null).optional(),
  firmInvoiceAmount: moneySchema.optional(),
  firmExpensesAmount: moneySchema.optional(),
  clientBillingRef: Joi.string().trim().max(100).allow(null, "").optional(),
  taxRate: percentSchema.optional(),
  specialInstructions: Joi.string().max(5000).allow(null, "").optional(),
  notes: Joi.string().max(5000).allow(null, "").optional(),
  lineItems: Joi.array().items(lineItemInputSchema).optional(),
  amountDue: Joi.number().precision(2).min(0).max(9999999999.99).optional(),
  attachments: Joi.array().items(attachmentInputSchema).max(50).optional(),
}).min(1);

const invoiceBatchIdParamSchema = Joi.object({
  batchId: Joi.string().uuid().required(),
});

const updateBatchAttachmentsSchema = Joi.object({
  attachments: Joi.array().items(attachmentInputSchema).max(50).required(),
});

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
  invoiceBatchIdParamSchema,
  caseBillingConfigSchema,
  listBillingConfigurationsSchema,
  listApprovedTimesheetsSchema,
  generateInvoiceSchema,
  updateInvoiceSchema,
  updateBatchAttachmentsSchema,
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
