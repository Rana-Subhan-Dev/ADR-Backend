const express = require("express");
const participantController = require("../controllers/participant.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const {
  caseIdSchema,
  participantIdSchema,
  inviteParticipantSchema,
  updateParticipantSchema,
  getParticipantsSchema,
  revokeParticipantSchema,
  updateAccessSchema,
  assignNeutralSchema,
} = require("../validations/participant.validation");

const router = express.Router({ mergeParams: true });

router.use(auth);

router.get(
  "/available-neutrals",
  validate(caseIdSchema, "params"),
  participantController.getAvailableNeutrals,
);

router.put(
  "/neutral-assignment",
  validate(caseIdSchema, "params"),
  validate(assignNeutralSchema),
  participantController.assignNeutral,
);

router.post(
  "/",
  validate(caseIdSchema, "params"),
  validate(inviteParticipantSchema),
  participantController.inviteParticipant,
);

router.get(
  "/",
  validate(caseIdSchema, "params"),
  validate(getParticipantsSchema, "query"),
  participantController.getParticipants,
);

router.get(
  "/:participantId",
  validate(participantIdSchema, "params"),
  participantController.getParticipant,
);

router.patch(
  "/:participantId",
  validate(participantIdSchema, "params"),
  validate(updateParticipantSchema),
  participantController.updateParticipant,
);

router.post(
  "/:participantId/resend-invitation",
  validate(participantIdSchema, "params"),
  participantController.resendInvitation,
);

router.post(
  "/:participantId/revoke-invitation",
  validate(participantIdSchema, "params"),
  validate(revokeParticipantSchema),
  participantController.revokeInvitation,
);

router.patch(
  "/:participantId/access",
  validate(participantIdSchema, "params"),
  validate(updateAccessSchema),
  participantController.updateAccess,
);

module.exports = router;
