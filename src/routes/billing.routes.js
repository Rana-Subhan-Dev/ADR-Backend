const express = require("express");
const controller = require("../controllers/billing.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const validation = require("../validations/billing.validation");
const {
  requirePermission,
  requireInternalRole,
} = require("../middlewares/permission.middleware");
const {
  PermissionModule,
  PermissionAction,
} = require("../constants/permission.constants");
const { RoleName } = require("../constants/auth.constants");

const router = express.Router();
router.use(auth);

router.get(
  "/configurations",
  requirePermission(PermissionModule.BILLING, PermissionAction.VIEW),
  validate(validation.listBillingConfigurationsSchema, "query"),
  controller.getBillingConfigurationsList,
);

router.get(
  "/cases/:caseId/configuration",
  requirePermission(PermissionModule.BILLING, PermissionAction.VIEW),
  validate(validation.caseIdParamSchema, "params"),
  controller.getCaseBillingConfig,
);

router.put(
  "/cases/:caseId/configuration",
  requirePermission(PermissionModule.BILLING, PermissionAction.EDIT),
  validate(validation.caseIdParamSchema, "params"),
  validate(validation.caseBillingConfigSchema),
  controller.upsertCaseBillingConfig,
);

router.get(
  "/approved-timesheets",
  requirePermission(PermissionModule.BILLING, PermissionAction.VIEW),
  validate(validation.listApprovedTimesheetsSchema, "query"),
  controller.getApprovedTimesheets,
);

router.get(
  "/invoices",
  requirePermission(PermissionModule.BILLING, PermissionAction.VIEW),
  validate(validation.listInvoicesSchema, "query"),
  controller.getInvoicesList,
);

router.post(
  "/invoices",
  requirePermission(PermissionModule.BILLING, PermissionAction.CREATE),
  validate(validation.generateInvoiceSchema),
  controller.generateDraftInvoice,
);

router.get(
  "/invoices/:invoiceId",
  requirePermission(PermissionModule.BILLING, PermissionAction.VIEW),
  validate(validation.invoiceIdParamSchema, "params"),
  controller.getInvoiceById,
);

router.patch(
  "/invoices/:invoiceId",
  requirePermission(PermissionModule.BILLING, PermissionAction.EDIT),
  validate(validation.invoiceIdParamSchema, "params"),
  validate(validation.updateInvoiceSchema),
  controller.updateInvoice,
);

router.post(
  "/invoices/:invoiceId/submit-for-review",
  requirePermission(PermissionModule.BILLING, PermissionAction.EDIT),
  validate(validation.invoiceIdParamSchema, "params"),
  validate(validation.submitForReviewSchema),
  controller.submitInvoiceForReview,
);

router.post(
  "/invoices/:invoiceId/finalize",
  requirePermission(PermissionModule.BILLING, PermissionAction.APPROVE),
  validate(validation.invoiceIdParamSchema, "params"),
  controller.finalizeInvoice,
);

router.post(
  "/invoices/:invoiceId/send",
  requirePermission(PermissionModule.BILLING, PermissionAction.EDIT),
  validate(validation.invoiceIdParamSchema, "params"),
  validate(validation.sendInvoiceSchema),
  controller.sendInvoice,
);

router.post(
  "/invoices/:invoiceId/void",
  requirePermission(PermissionModule.BILLING, PermissionAction.EDIT),
  validate(validation.invoiceIdParamSchema, "params"),
  validate(validation.voidInvoiceSchema),
  controller.voidInvoice,
);

router.post(
  "/invoices/:invoiceId/reissue",
  requirePermission(PermissionModule.BILLING, PermissionAction.CREATE),
  validate(validation.invoiceIdParamSchema, "params"),
  validate(validation.reissueInvoiceSchema),
  controller.reissueInvoice,
);

router.get(
  "/payments",
  requirePermission(PermissionModule.BILLING, PermissionAction.VIEW),
  validate(validation.listPaymentsSchema, "query"),
  controller.getPaymentTracking,
);

router.post(
  "/invoices/:invoiceId/payments",
  requirePermission(PermissionModule.BILLING, PermissionAction.CREATE),
  validate(validation.invoiceIdParamSchema, "params"),
  validate(validation.recordPaymentSchema),
  controller.recordPayment,
);

router.post(
  "/invoices/:invoiceId/credit-notes",
  requirePermission(PermissionModule.BILLING, PermissionAction.CREATE),
  validate(validation.invoiceIdParamSchema, "params"),
  validate(validation.recordCreditNoteSchema),
  controller.recordCreditNote,
);

router.post(
  "/invoices/:invoiceId/sync-quickbooks",
  requirePermission(PermissionModule.BILLING, PermissionAction.EDIT),
  validate(validation.invoiceIdParamSchema, "params"),
  controller.syncInvoiceToQuickBooks,
);

router.get(
  "/quickbooks/sync-logs",
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.ACCOUNTING_STAFF,
    RoleName.CASE_MANAGER,
  ),
  requirePermission(PermissionModule.BILLING, PermissionAction.VIEW),
  validate(validation.listQuickBooksSyncLogsSchema, "query"),
  controller.getQuickBooksSyncLogs,
);

router.post(
  "/quickbooks/retry-sync",
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ACCOUNTING_STAFF,
    RoleName.CASE_MANAGER,
  ),
  requirePermission(PermissionModule.BILLING, PermissionAction.EDIT),
  validate(validation.retryQuickBooksSyncSchema),
  controller.retryQuickBooksSync,
);

router.post(
  "/cases/:caseId/neutral-payment-statement",
  requirePermission(PermissionModule.BILLING, PermissionAction.CREATE),
  validate(validation.caseIdParamSchema, "params"),
  validate(validation.neutralPaymentStatementSchema),
  controller.generateNeutralPaymentStatement,
);

module.exports = router;
