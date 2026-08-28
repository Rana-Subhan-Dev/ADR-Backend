const express = require("express");
const hearingController = require("../controllers/hearing.controller");
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
  hearingIdSchema,
  scheduleHearingSchema,
  updateHearingSchema,
  rescheduleHearingSchema,
  cancelHearingSchema,
  getHearingsSchema,
  availabilitySchema,
  availableSlotsSchema,
} = require("../validations/hearing.validation");

const router = express.Router({ mergeParams: true });

router.use(auth);

router.get(
  "/availability",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(caseIdSchema, "params"),
  validate(availabilitySchema, "query"),
  hearingController.checkAvailability,
);

router.get(
  "/availability-slots",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(caseIdSchema, "params"),
  validate(availableSlotsSchema, "query"),
  hearingController.getAvailableSlots,
);

router.post(
  "/",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(caseIdSchema, "params"),
  validate(scheduleHearingSchema),
  hearingController.scheduleHearing,
);

router.get(
  "/",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(caseIdSchema, "params"),
  validate(getHearingsSchema, "query"),
  hearingController.getHearings,
);

router.get(
  "/:hearingId",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(hearingIdSchema, "params"),
  hearingController.getHearing,
);

router.patch(
  "/:hearingId",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(hearingIdSchema, "params"),
  validate(updateHearingSchema),
  hearingController.updateHearing,
);

router.post(
  "/:hearingId/reschedule",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(hearingIdSchema, "params"),
  validate(rescheduleHearingSchema),
  hearingController.rescheduleHearing,
);

router.post(
  "/:hearingId/cancel",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(hearingIdSchema, "params"),
  validate(cancelHearingSchema),
  hearingController.cancelHearing,
);

module.exports = router;
