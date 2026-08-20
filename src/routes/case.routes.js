const express = require("express");

const caseController = require("../controllers/case.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");

const {
  createCaseSchema,
  getCasesSchema,
  caseIdSchema,
  updateCaseSchema,
  updateCaseStatusSchema,
} = require("../validations/case.validation");

const router = express.Router();

router.use(auth);

router.post("/", validate(createCaseSchema), caseController.createCase);

router.get("/", validate(getCasesSchema, "query"), caseController.getCases);

router.get(
  "/:id",
  validate(caseIdSchema, "params"),
  caseController.getCaseById,
);

router.patch(
  "/:id",
  validate(caseIdSchema, "params"),
  validate(updateCaseSchema),
  caseController.updateCase,
);

router.patch(
  "/:id/status",
  validate(caseIdSchema, "params"),
  validate(updateCaseStatusSchema),
  caseController.updateCaseStatus,
);

module.exports = router;
