const express = require("express");
const controller = require("../controllers/timesheet.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const validation = require("../validations/timesheet.validation");

const router = express.Router({ mergeParams: true });
router.use(auth);
router.post(
  "/",
  validate(validation.caseIdSchema, "params"),
  validate(validation.createTimesheetSchema),
  controller.createTimesheet,
);
router.get(
  "/",
  validate(validation.caseIdSchema, "params"),
  validate(validation.listTimesheetsSchema, "query"),
  controller.getTimesheets,
);
router.get(
  "/:timesheetId",
  validate(validation.timesheetIdSchema, "params"),
  controller.getTimesheet,
);
router.patch(
  "/:timesheetId",
  validate(validation.timesheetIdSchema, "params"),
  validate(validation.updateTimesheetSchema),
  controller.updateTimesheet,
);
router.delete(
  "/:timesheetId",
  validate(validation.timesheetIdSchema, "params"),
  controller.deleteTimesheet,
);
router.post(
  "/:timesheetId/submit",
  validate(validation.timesheetIdSchema, "params"),
  controller.submitTimesheet,
);
router.post(
  "/:timesheetId/review",
  validate(validation.timesheetIdSchema, "params"),
  validate(validation.reviewTimesheetSchema),
  controller.reviewTimesheet,
);
module.exports = router;
