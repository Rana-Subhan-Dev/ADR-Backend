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
module.exports = router;
