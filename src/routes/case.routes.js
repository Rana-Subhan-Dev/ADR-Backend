const express = require("express");

const caseController = require("../controllers/case.controller");
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
  createCaseSchema,
  getCasesSchema,
  caseIdSchema,
  updateCaseSchema,
  updateCaseStatusSchema,
  closeCaseSchema,
  reopenCaseSchema,
} = require("../validations/case.validation");

const router = express.Router();

router.use(auth);

router.post(
  "/",
  requirePermission(PermissionModule.CASES, PermissionAction.CREATE),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(createCaseSchema),
  caseController.createCase,
);

router.get(
  "/",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(getCasesSchema, "query"),
  caseController.getCases,
);

router.get(
  "/:id/closure-checklist",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(caseIdSchema, "params"),
  caseController.getClosureChecklist,
);

router.post(
  "/:id/close",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(caseIdSchema, "params"),
  validate(closeCaseSchema),
  caseController.closeCase,
);

router.post(
  "/:id/reopen",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(caseIdSchema, "params"),
  validate(reopenCaseSchema),
  caseController.reopenCase,
);

router.get(
  "/:id",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(caseIdSchema, "params"),
  caseController.getCaseById,
);

router.patch(
  "/:id",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(caseIdSchema, "params"),
  validate(updateCaseSchema),
  caseController.updateCase,
);

router.patch(
  "/:id/status",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(caseIdSchema, "params"),
  validate(updateCaseStatusSchema),
  caseController.updateCaseStatus,
);

module.exports = router;
