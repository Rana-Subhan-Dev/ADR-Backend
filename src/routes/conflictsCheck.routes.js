const express = require("express");
const controller = require("../controllers/conflictsCheck.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const validation = require("../validations/conflictsCheck.validation");
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
router.use(
  requireInternalRole(
    RoleName.CASE_MANAGER,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.SUPER_ADMIN,
  ),
);

router.get(
  "/neutrals",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  controller.listNeutrals,
);

router.post(
  "/",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(validation.createConflictsCheckSchema),
  controller.createConflictsCheck,
);

router.get(
  "/",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(validation.listConflictsChecksSchema, "query"),
  controller.listConflictsChecks,
);

router.get(
  "/:id",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(validation.conflictsCheckIdSchema, "params"),
  controller.getConflictsCheckById,
);

router.get(
  "/:id/export",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(validation.conflictsCheckIdSchema, "params"),
  controller.exportConflictsCheckPdf,
);

module.exports = router;
