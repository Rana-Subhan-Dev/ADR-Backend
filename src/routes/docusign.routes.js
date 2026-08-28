const express = require("express");
const controller = require("../controllers/docusign.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const validation = require("../validations/docusign.validation");
const {
  requirePermission,
  requireInternalRole,
} = require("../middlewares/permission.middleware");
const {
  PermissionModule,
  PermissionAction,
} = require("../constants/permission.constants");
const { RoleName } = require("../constants/auth.constants");

const router = express.Router({ mergeParams: true });
router.use(auth);
router.post(
  "/envelopes",
  requirePermission(PermissionModule.DOCUSIGN, PermissionAction.CREATE),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(validation.caseIdSchema, "params"),
  validate(validation.createEnvelopeSchema),
  controller.createEnvelope,
);
router.get(
  "/envelopes",
  requirePermission(PermissionModule.DOCUSIGN, PermissionAction.VIEW),
  validate(validation.caseIdSchema, "params"),
  validate(validation.listEnvelopesSchema, "query"),
  controller.getEnvelopes,
);
router.get(
  "/envelopes/:envelopeRecordId",
  requirePermission(PermissionModule.DOCUSIGN, PermissionAction.VIEW),
  validate(validation.envelopeRecordIdSchema, "params"),
  controller.getEnvelope,
);
router.patch(
  "/envelopes/:envelopeRecordId",
  requirePermission(PermissionModule.DOCUSIGN, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(validation.envelopeRecordIdSchema, "params"),
  validate(validation.updateEnvelopeSchema),
  controller.updateEnvelope,
);
router.post(
  "/envelopes/:envelopeRecordId/send",
  requirePermission(PermissionModule.DOCUSIGN, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(validation.envelopeRecordIdSchema, "params"),
  controller.queueSend,
);
router.post(
  "/envelopes/:envelopeRecordId/remind",
  requirePermission(PermissionModule.DOCUSIGN, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(validation.envelopeRecordIdSchema, "params"),
  controller.queueReminder,
);
module.exports = router;
