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

const manageRoles = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN_LEADERSHIP,
  RoleName.CASE_MANAGER,
];

router.get(
  "/templates",
  requirePermission(PermissionModule.DOCUSIGN, PermissionAction.VIEW),
  requireInternalRole(...manageRoles),
  validate(validation.caseIdSchema, "params"),
  controller.listTemplates,
);

router.post(
  "/envelopes/send",
  requirePermission(PermissionModule.DOCUSIGN, PermissionAction.CREATE),
  requireInternalRole(...manageRoles),
  validate(validation.caseIdSchema, "params"),
  validate(validation.sendEnvelopeSchema),
  controller.sendEnvelope,
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

router.post(
  "/envelopes/:envelopeRecordId/remind",
  requirePermission(PermissionModule.DOCUSIGN, PermissionAction.EDIT),
  requireInternalRole(...manageRoles),
  validate(validation.envelopeRecordIdSchema, "params"),
  controller.remindEnvelope,
);

router.get(
  "/envelopes/:envelopeRecordId/signed-pdf",
  requirePermission(PermissionModule.DOCUSIGN, PermissionAction.VIEW),
  validate(validation.envelopeRecordIdSchema, "params"),
  controller.getSignedPdf,
);

router.get(
  "/envelopes/:envelopeRecordId/source-pdf",
  requirePermission(PermissionModule.DOCUSIGN, PermissionAction.VIEW),
  validate(validation.envelopeRecordIdSchema, "params"),
  controller.getSourcePdf,
);

router.post(
  "/envelopes/:envelopeRecordId/signing-url",
  requirePermission(PermissionModule.DOCUSIGN, PermissionAction.VIEW),
  validate(validation.envelopeRecordIdSchema, "params"),
  validate(validation.recipientViewSchema),
  controller.getSigningUrl,
);

module.exports = router;
