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

const router = express.Router();
router.use(auth);

router.get(
  "/",
  requirePermission(PermissionModule.TIMESHEETS, PermissionAction.VIEW),
  validate(validation.listTimesheetsSchema, "query"),
  controller.listTimesheetsHub,
);

module.exports = router;
