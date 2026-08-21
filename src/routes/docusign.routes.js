const express = require("express");
const controller = require("../controllers/docusign.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const validation = require("../validations/docusign.validation");

const router = express.Router({ mergeParams: true });
router.use(auth);
router.post(
  "/envelopes",
  validate(validation.caseIdSchema, "params"),
  validate(validation.createEnvelopeSchema),
  controller.createEnvelope,
);
router.get(
  "/envelopes",
  validate(validation.caseIdSchema, "params"),
  validate(validation.listEnvelopesSchema, "query"),
  controller.getEnvelopes,
);
router.get(
  "/envelopes/:envelopeRecordId",
  validate(validation.envelopeRecordIdSchema, "params"),
  controller.getEnvelope,
);
router.patch(
  "/envelopes/:envelopeRecordId",
  validate(validation.envelopeRecordIdSchema, "params"),
  validate(validation.updateEnvelopeSchema),
  controller.updateEnvelope,
);
router.post(
  "/envelopes/:envelopeRecordId/send",
  validate(validation.envelopeRecordIdSchema, "params"),
  controller.queueSend,
);
router.post(
  "/envelopes/:envelopeRecordId/remind",
  validate(validation.envelopeRecordIdSchema, "params"),
  controller.queueReminder,
);
module.exports = router;
