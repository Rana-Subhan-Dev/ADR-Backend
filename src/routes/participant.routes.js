const express = require("express");
const participantController = require("../controllers/participant.controller");
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
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(caseIdSchema, "params"),
  participantController.getAvailableNeutrals,
);

router.put(
  "/neutral-assignment",
  requirePermission(PermissionModule.CASES, PermissionAction.ASSIGN),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(caseIdSchema, "params"),
  validate(assignNeutralSchema),
  participantController.assignNeutral,
);

router.post(
  "/",
  requirePermission(PermissionModule.CASES, PermissionAction.INVITE),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(caseIdSchema, "params"),
  validate(inviteParticipantSchema),
  participantController.inviteParticipant,
);

router.get(
  "/",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(caseIdSchema, "params"),
  validate(getParticipantsSchema, "query"),
  participantController.getParticipants,
);

router.get(
  "/:participantId",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(participantIdSchema, "params"),
  participantController.getParticipant,
);

router.patch(
  "/:participantId",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(participantIdSchema, "params"),
  validate(updateParticipantSchema),
  participantController.updateParticipant,
);

router.post(
  "/:participantId/resend-invitation",
  requirePermission(PermissionModule.CASES, PermissionAction.INVITE),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(participantIdSchema, "params"),
  participantController.resendInvitation,
);

router.post(
  "/:participantId/revoke-invitation",
  requirePermission(PermissionModule.CASES, PermissionAction.REVOKE),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(participantIdSchema, "params"),
  validate(revokeParticipantSchema),
  participantController.revokeInvitation,
);

router.patch(
  "/:participantId/access",
  requirePermission(PermissionModule.CASES, PermissionAction.REVOKE),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(participantIdSchema, "params"),
  validate(updateAccessSchema),
  participantController.updateAccess,
);

module.exports = router;
