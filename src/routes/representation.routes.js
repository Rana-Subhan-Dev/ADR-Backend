const express = require("express");
const representationController = require("../controllers/representation.controller");
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
  createRepresentationSchema,
  updateRepresentationSchema,
  representationIdSchema,
  getRepresentationsSchema,
} = require("../validations/representation.validation");

const router = express.Router();

router.use(auth);

router.post(
  "/",
  requirePermission(PermissionModule.ATTORNEYS, PermissionAction.CREATE),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(createRepresentationSchema),
  representationController.createRepresentation,
);

router.get(
  "/",
  requirePermission(PermissionModule.ATTORNEYS, PermissionAction.VIEW),
  validate(getRepresentationsSchema, "query"),
  representationController.getRepresentations,
);

router.get(
  "/:representationId",
  requirePermission(PermissionModule.ATTORNEYS, PermissionAction.VIEW),
  validate(representationIdSchema, "params"),
  representationController.getRepresentationById,
);

router.patch(
  "/:representationId",
  requirePermission(PermissionModule.ATTORNEYS, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(representationIdSchema, "params"),
  validate(updateRepresentationSchema),
  representationController.updateRepresentation,
);

router.delete(
  "/:representationId",
  requirePermission(PermissionModule.ATTORNEYS, PermissionAction.DELETE),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(representationIdSchema, "params"),
  representationController.deleteRepresentation,
);

module.exports = router;
