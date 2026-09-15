const express = require("express");
const controller = require("../controllers/timesheet.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const validation = require("../validations/timesheet.validation");
const { requirePermission } = require("../middlewares/permission.middleware");
const {
  PermissionModule,
  PermissionAction,
} = require("../constants/permission.constants");

const router = express.Router({ mergeParams: true });
router.use(auth);

router.post(
  "/",
  requirePermission(PermissionModule.TIMESHEETS, PermissionAction.CREATE),
  validate(validation.caseIdSchema, "params"),
  validate(validation.createTimesheetSchema),
  controller.createTimesheet,
);
router.get(
  "/",
  requirePermission(PermissionModule.TIMESHEETS, PermissionAction.VIEW),
  validate(validation.caseIdSchema, "params"),
  validate(validation.listTimesheetsSchema, "query"),
  controller.getTimesheets,
);
router.get(
  "/:timesheetId",
  requirePermission(PermissionModule.TIMESHEETS, PermissionAction.VIEW),
  validate(validation.timesheetIdSchema, "params"),
  controller.getTimesheet,
);
router.patch(
  "/:timesheetId",
  requirePermission(PermissionModule.TIMESHEETS, PermissionAction.EDIT),
  validate(validation.timesheetIdSchema, "params"),
  validate(validation.updateTimesheetSchema),
  controller.updateTimesheet,
);
router.delete(
  "/:timesheetId",
  requirePermission(PermissionModule.TIMESHEETS, PermissionAction.EDIT),
  validate(validation.timesheetIdSchema, "params"),
  controller.deleteTimesheet,
);
router.post(
  "/:timesheetId/submit",
  requirePermission(PermissionModule.TIMESHEETS, PermissionAction.EDIT),
  validate(validation.timesheetIdSchema, "params"),
  controller.submitTimesheet,
);
router.post(
  "/:timesheetId/review",
  requirePermission(PermissionModule.TIMESHEETS, PermissionAction.APPROVE),
  validate(validation.timesheetIdSchema, "params"),
  validate(validation.reviewTimesheetSchema),
  controller.reviewTimesheet,
);

router.post(
  "/:timesheetId/expenses",
  requirePermission(PermissionModule.TIMESHEETS, PermissionAction.EDIT),
  validate(validation.timesheetIdSchema, "params"),
  validate(validation.createExpenseSchema),
  controller.addExpense,
);
router.patch(
  "/:timesheetId/expenses/:expenseId",
  requirePermission(PermissionModule.TIMESHEETS, PermissionAction.EDIT),
  validate(validation.expenseIdSchema, "params"),
  validate(validation.updateExpenseSchema),
  controller.updateExpense,
);
router.delete(
  "/:timesheetId/expenses/:expenseId",
  requirePermission(PermissionModule.TIMESHEETS, PermissionAction.EDIT),
  validate(validation.expenseIdSchema, "params"),
  controller.deleteExpense,
);
router.post(
  "/:timesheetId/expenses/:expenseId/receipts",
  requirePermission(PermissionModule.TIMESHEETS, PermissionAction.EDIT),
  validate(validation.expenseIdSchema, "params"),
  validate(validation.attachReceiptSchema),
  controller.attachExpenseReceipt,
);
router.delete(
  "/:timesheetId/expenses/:expenseId/receipts/:documentId",
  requirePermission(PermissionModule.TIMESHEETS, PermissionAction.EDIT),
  validate(validation.expenseReceiptSchema, "params"),
  controller.removeExpenseReceipt,
);

module.exports = router;
