const express = require("express");
const accountingController = require("../controllers/accounting.controller");
const auth = require("../middlewares/auth.middleware");
const requireRole = require("../middlewares/role.middleware");
const validate = require("../middlewares/validate.middleware");
const { RoleName } = require("../constants/auth.constants");
const {
  caseFinancialsListQuerySchema,
  timesheetsListQuerySchema,
  caseIdParamSchema,
  contactCaseManagerSchema,
  financeActivityListQuerySchema,
} = require("../validations/accounting.validation");

const router = express.Router();

router.use(auth);
router.use(requireRole(RoleName.ACCOUNTING_STAFF, RoleName.SUPER_ADMIN));

router.get(
  "/case-financials",
  validate(caseFinancialsListQuerySchema, "query"),
  accountingController.listCaseFinancials,
);

router.get(
  "/case-financials/:caseId",
  validate(caseIdParamSchema, "params"),
  accountingController.getCaseFinancials,
);

router.post(
  "/case-financials/:caseId/contact-case-manager",
  validate(caseIdParamSchema, "params"),
  validate(contactCaseManagerSchema),
  accountingController.contactCaseManager,
);

router.get(
  "/timesheets",
  validate(timesheetsListQuerySchema, "query"),
  accountingController.listTimesheets,
);

router.get(
  "/finance-activity",
  validate(financeActivityListQuerySchema, "query"),
  accountingController.listFinanceActivity,
);

module.exports = router;
