const billingService = require("../services/billing.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const respond = (status, message, handler) =>
  asyncHandler(async (req, res) =>
    res
      .status(status)
      .json(new ApiResponse(status, await handler(req), message)),
  );

const getBillingConfigurationsList = respond(
  200,
  "Billing configurations fetched successfully.",
  (req) => billingService.getBillingConfigurationsList(req.query, req.user),
);

const getCaseBillingConfig = respond(
  200,
  "Case billing configuration fetched successfully.",
  (req) => billingService.getCaseBillingConfig(req.params.caseId, req.user),
);

const upsertCaseBillingConfig = respond(
  200,
  "Case billing configuration saved successfully.",
  (req) =>
    billingService.upsertCaseBillingConfig(
      req.params.caseId,
      req.body,
      req.user,
    ),
);

const getApprovedTimesheets = respond(
  200,
  "Approved timesheets fetched successfully.",
  (req) => billingService.getApprovedTimesheets(req.query, req.user),
);

const generateDraftInvoice = respond(
  201,
  "Draft invoice created successfully.",
  (req) => billingService.generateDraftInvoice(req.body, req.user),
);

const getInvoicesList = respond(200, "Invoices fetched successfully.", (req) =>
  billingService.getInvoicesList(req.query, req.user),
);

const getInvoiceById = respond(
  200,
  "Invoice details fetched successfully.",
  (req) => billingService.getInvoiceById(req.params.invoiceId, req.user),
);

const updateInvoice = respond(200, "Invoice updated successfully.", (req) =>
  billingService.updateInvoice(req.params.invoiceId, req.body, req.user),
);

const submitInvoiceForReview = respond(
  200,
  "Invoice submitted for peer/controller review successfully.",
  (req) =>
    billingService.submitInvoiceForReview(
      req.params.invoiceId,
      req.body,
      req.user,
    ),
);

const finalizeInvoice = respond(200, "Invoice finalized successfully.", (req) =>
  billingService.finalizeInvoice(req.params.invoiceId, req.user),
);

const sendInvoice = respond(200, "Invoice sent successfully.", (req) =>
  billingService.sendInvoice(req.params.invoiceId, req.body, req.user),
);

const voidInvoice = respond(200, "Invoice voided successfully.", (req) =>
  billingService.voidInvoice(req.params.invoiceId, req.body.reason, req.user),
);

const reissueInvoice = respond(201, "Invoice reissued successfully.", (req) =>
  billingService.reissueInvoice(req.params.invoiceId, req.body, req.user),
);

const recordPayment = respond(201, "Payment recorded successfully.", (req) =>
  billingService.recordPayment(req.params.invoiceId, req.body, req.user),
);

const recordCreditNote = respond(
  201,
  "Credit note recorded successfully.",
  (req) =>
    billingService.recordCreditNote(req.params.invoiceId, req.body, req.user),
);

const getPaymentTracking = respond(
  200,
  "Payment tracking records fetched successfully.",
  (req) => billingService.getPaymentTracking(req.query, req.user),
);

const syncInvoiceToQuickBooks = respond(
  200,
  "Invoice synced with QuickBooks successfully.",
  (req) =>
    billingService.syncInvoiceToQuickBooks(req.params.invoiceId, req.user),
);

const getQuickBooksSyncLogs = respond(
  200,
  "QuickBooks sync logs fetched successfully.",
  (req) => billingService.getQuickBooksSyncLogs(req.query, req.user),
);

const retryQuickBooksSync = respond(
  200,
  "QuickBooks sync retry executed successfully.",
  (req) => billingService.retryQuickBooksSync(req.body, req.user),
);

const generateNeutralPaymentStatement = respond(
  200,
  "Neutral payment statement generated successfully.",
  (req) =>
    billingService.generateNeutralPaymentStatement(
      req.params.caseId,
      req.body,
      req.user,
    ),
);

module.exports = {
  getBillingConfigurationsList,
  getCaseBillingConfig,
  upsertCaseBillingConfig,
  getApprovedTimesheets,
  generateDraftInvoice,
  getInvoicesList,
  getInvoiceById,
  updateInvoice,
  submitInvoiceForReview,
  finalizeInvoice,
  sendInvoice,
  voidInvoice,
  reissueInvoice,
  recordPayment,
  recordCreditNote,
  getPaymentTracking,
  syncInvoiceToQuickBooks,
  getQuickBooksSyncLogs,
  retryQuickBooksSync,
  generateNeutralPaymentStatement,
};
