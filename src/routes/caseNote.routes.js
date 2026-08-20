const express = require("express");
const caseNoteController = require("../controllers/caseNote.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
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
  validate(caseIdSchema, "params"),
  validate(createCaseNoteSchema),
  caseNoteController.createCaseNote,
);
router.get(
  "/",
  validate(caseIdSchema, "params"),
  validate(getCaseNotesSchema, "query"),
  caseNoteController.getCaseNotes,
);
router.get(
  "/:noteId",
  validate(noteIdSchema, "params"),
  caseNoteController.getCaseNote,
);
router.patch(
  "/:noteId",
  validate(noteIdSchema, "params"),
  validate(updateCaseNoteSchema),
  caseNoteController.updateCaseNote,
);
router.delete(
  "/:noteId",
  validate(noteIdSchema, "params"),
  caseNoteController.deleteCaseNote,
);

module.exports = router;
