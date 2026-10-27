const express = require("express");
const dashboardController = require("../controllers/dashboard.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const {
  requirePermission,
  requireInternalRole,
} = require("../middlewares/permission.middleware");
const {
  PermissionModule,
  PermissionAction,
} = require("../constants/permission.constants");
const { RoleName } = require("../constants/auth.constants");
const {
  overviewQuerySchema,
  lawyerDashboardQuerySchema,
  caseManagerDashboardQuerySchema,
} = require("../validations/dashboard.validation");

const router = express.Router();

router.use(auth);

router.get(
  "/overview",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(overviewQuerySchema, "query"),
  dashboardController.getOverview,
);

router.get(
  "/lawyer",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  requireInternalRole(RoleName.LAWYER),
  validate(lawyerDashboardQuerySchema, "query"),
  dashboardController.getLawyerDashboard,
);

router.get(
  "/case-manager",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  requireInternalRole(
    RoleName.CASE_MANAGER,
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
  ),
  validate(caseManagerDashboardQuerySchema, "query"),
  dashboardController.getCaseManagerDashboard,
);

module.exports = router;
