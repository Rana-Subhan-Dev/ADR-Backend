const express = require("express");
const attorneyLawFirmController = require("../controllers/attorneyLawFirm.controller");
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
  createLawFirmSchema,
  updateLawFirmSchema,
  lawFirmIdSchema,
  getLawFirmsSchema,
  createAttorneySchema,
  updateAttorneySchema,
  attorneyIdSchema,
  getAttorneysSchema,
  attorneyDetailsSchema,
} = require("../validations/attorneyLawFirm.validation");

const router = express.Router();

router.use(auth);
const manageAttorneys = requireInternalRole(
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN_LEADERSHIP,
  RoleName.CASE_MANAGER,
);

router.post(
  "/law-firms",
  requirePermission(PermissionModule.ATTORNEYS, PermissionAction.CREATE),
  manageAttorneys,
  validate(createLawFirmSchema),
  attorneyLawFirmController.createLawFirm,
);

router.get(
  "/law-firms",
  requirePermission(PermissionModule.ATTORNEYS, PermissionAction.VIEW),
  validate(getLawFirmsSchema, "query"),
  attorneyLawFirmController.getLawFirms,
);

router.get(
  "/law-firms/:lawFirmId",
  requirePermission(PermissionModule.ATTORNEYS, PermissionAction.VIEW),
  validate(lawFirmIdSchema, "params"),
  attorneyLawFirmController.getLawFirmById,
);

router.patch(
  "/law-firms/:lawFirmId",
  requirePermission(PermissionModule.ATTORNEYS, PermissionAction.EDIT),
  manageAttorneys,
  validate(lawFirmIdSchema, "params"),
  validate(updateLawFirmSchema),
  attorneyLawFirmController.updateLawFirm,
);

router.delete(
  "/law-firms/:lawFirmId",
  requirePermission(PermissionModule.ATTORNEYS, PermissionAction.DELETE),
  manageAttorneys,
  validate(lawFirmIdSchema, "params"),
  attorneyLawFirmController.deleteLawFirm,
);

router.post(
  "/attorneys",
  requirePermission(PermissionModule.ATTORNEYS, PermissionAction.CREATE),
  manageAttorneys,
  validate(createAttorneySchema),
  attorneyLawFirmController.createAttorney,
);

router.get(
  "/attorneys",
  requirePermission(PermissionModule.ATTORNEYS, PermissionAction.VIEW),
  validate(getAttorneysSchema, "query"),
  attorneyLawFirmController.getAttorneys,
);

router.get(
  "/attorneys/:attorneyId",
  requirePermission(PermissionModule.ATTORNEYS, PermissionAction.VIEW),
  validate(attorneyIdSchema, "params"),
  validate(attorneyDetailsSchema, "query"),
  attorneyLawFirmController.getAttorneyById,
);

router.patch(
  "/attorneys/:attorneyId",
  requirePermission(PermissionModule.ATTORNEYS, PermissionAction.EDIT),
  manageAttorneys,
  validate(attorneyIdSchema, "params"),
  validate(updateAttorneySchema),
  attorneyLawFirmController.updateAttorney,
);

router.delete(
  "/attorneys/:attorneyId",
  requirePermission(PermissionModule.ATTORNEYS, PermissionAction.DELETE),
  manageAttorneys,
  validate(attorneyIdSchema, "params"),
  attorneyLawFirmController.deleteAttorney,
);

module.exports = router;
