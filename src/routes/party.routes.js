const express = require("express");

const partyController = require("../controllers/party.controller");
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
  createPartySchema,
  getPartiesSchema,
  partyIdSchema,
  updatePartySchema,
} = require("../validations/party.validation");

const router = express.Router();

router.use(auth);

router.post(
  "/",
  requirePermission(PermissionModule.PARTIES, PermissionAction.CREATE),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(createPartySchema),
  partyController.createParty,
);

router.get(
  "/",
  requirePermission(PermissionModule.PARTIES, PermissionAction.VIEW),
  validate(getPartiesSchema, "query"),
  partyController.getParties,
);

router.patch(
  "/:id",
  requirePermission(PermissionModule.PARTIES, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(partyIdSchema, "params"),
  validate(updatePartySchema),
  partyController.updateParty,
);

router.delete(
  "/:id",
  requirePermission(PermissionModule.PARTIES, PermissionAction.DELETE),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(partyIdSchema, "params"),
  partyController.deleteParty,
);

module.exports = router;
