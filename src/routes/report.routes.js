const express = require("express");
const reportController = require("../controllers/report.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const {
  PermissionModule,
  PermissionAction,
} = require("../constants/permission.constants");
const {
  reportIdSchema,
  reportCatalogueQuerySchema,
  reportQuerySchema,
} = require("../validations/report.validation");

const router = express.Router();

router.use(auth);

router.get(
  "/",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(reportCatalogueQuerySchema, "query"),
  reportController.listReports,
);

router.get(
  "/:reportId",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(reportIdSchema, "params"),
  validate(reportQuerySchema, "query"),
  reportController.getReport,
);

module.exports = router;
