const express = require("express");
const caseNoteController = require("../controllers/caseNote.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const {
  requirePermission,
  requireAnyPermission,
} = require("../middlewares/permission.middleware");
const {
  PermissionModule,
  PermissionAction,
} = require("../constants/permission.constants");
const {
  caseIdSchema,
  noteIdSchema,
  createCaseNoteSchema,
  updateCaseNoteSchema,
  getCaseNotesSchema,
  replyCaseNoteSchema,
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
router.post(
  "/:noteId/replies",
  requirePermission(PermissionModule.CASES, PermissionAction.CREATE),
  validate(noteIdSchema, "params"),
  validate(replyCaseNoteSchema),
  caseNoteController.replyToCaseNote,
);
router.get(
  "/:noteId",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(noteIdSchema, "params"),
  caseNoteController.getCaseNote,
);
router.patch(
  "/:noteId",
  requireAnyPermission(
    [PermissionModule.CASES, PermissionAction.EDIT],
    [PermissionModule.CASES, PermissionAction.CREATE],
  ),
  validate(noteIdSchema, "params"),
  validate(updateCaseNoteSchema),
  caseNoteController.updateCaseNote,
);
router.delete(
  "/:noteId",
  requireAnyPermission(
    [PermissionModule.CASES, PermissionAction.DELETE],
    [PermissionModule.CASES, PermissionAction.CREATE],
  ),
  validate(noteIdSchema, "params"),
  caseNoteController.deleteCaseNote,
);

module.exports = router;
