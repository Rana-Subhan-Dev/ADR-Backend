const express = require("express");
const dashboardController = require("../controllers/dashboard.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const {
  PermissionModule,
  PermissionAction,
} = require("../constants/permission.constants");
const { overviewQuerySchema } = require("../validations/dashboard.validation");

const router = express.Router();

router.use(auth);

router.get(
  "/overview",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(overviewQuerySchema, "query"),
  dashboardController.getOverview,
);

module.exports = router;
