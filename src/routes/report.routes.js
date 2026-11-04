const express = require("express");
const reportController = require("../controllers/report.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const {
  requireAnyPermission,
  hasPermission,
} = require("../middlewares/permission.middleware");
const {
  PermissionModule,
  PermissionAction,
} = require("../constants/permission.constants");
const ApiError = require("../utils/apiError");
const {
  reportIdSchema,
  reportCatalogueQuerySchema,
  reportQuerySchema,
} = require("../validations/report.validation");

const router = express.Router();

router.use(auth);

const canViewReports = requireAnyPermission(
  [PermissionModule.CASES, PermissionAction.VIEW],
  [PermissionModule.REPORTS, PermissionAction.VIEW],
);

const assertCanExport = (req, res, next) => {
  if (String(req.query.format || "").toLowerCase() !== "csv") return next();
  if (
    hasPermission(req.user, PermissionModule.CASES, PermissionAction.VIEW) ||
    hasPermission(req.user, PermissionModule.REPORTS, PermissionAction.EXPORT) ||
    hasPermission(req.user, PermissionModule.REPORTS, PermissionAction.VIEW)
  ) {
    return next();
  }
  return next(
    new ApiError(403, "You do not have permission to export reports."),
  );
};

router.get(
  "/",
  canViewReports,
  validate(reportCatalogueQuerySchema, "query"),
  reportController.listReports,
);

router.get(
  "/:reportId",
  canViewReports,
  assertCanExport,
  validate(reportIdSchema, "params"),
  validate(reportQuerySchema, "query"),
  reportController.getReport,
);

module.exports = router;
