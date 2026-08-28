const express = require("express");
const caseNoteController = require("../controllers/caseNote.controller");
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
  caseIdSchema,
  noteIdSchema,
  createCaseNoteSchema,
  updateCaseNoteSchema,
  getCaseNotesSchema,
} = require("../validations/caseNote.validation");

const router = express.Router({ mergeParams: true });

router.use(auth);

router.post(
  "/",
  requirePermission(PermissionModule.CASES, PermissionAction.CREATE),
  validate(caseIdSchema, "params"),
  validate(createCaseNoteSchema),
  caseNoteController.createCaseNote,
);
router.get(
  "/",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(caseIdSchema, "params"),
  validate(getCaseNotesSchema, "query"),
  caseNoteController.getCaseNotes,
);
router.get(
  "/:noteId",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(noteIdSchema, "params"),
  caseNoteController.getCaseNote,
);
router.patch(
  "/:noteId",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  validate(noteIdSchema, "params"),
  validate(updateCaseNoteSchema),
  caseNoteController.updateCaseNote,
);
router.delete(
  "/:noteId",
  requirePermission(PermissionModule.CASES, PermissionAction.DELETE),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(noteIdSchema, "params"),
  caseNoteController.deleteCaseNote,
);

module.exports = router;
