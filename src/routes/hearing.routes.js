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
  listHearingsHubSchema,
  availabilitySchema,
  availableSlotsSchema,
  manualZoomLinkSchema,
} = require("../validations/hearing.validation");

const router = express.Router({ mergeParams: true });
const hubRouter = express.Router();

const mutatorRoles = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN_LEADERSHIP,
  RoleName.CASE_MANAGER,
];

router.use(auth);
hubRouter.use(auth);

hubRouter.get(
  "/",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(listHearingsHubSchema, "query"),
  hearingController.listHearingsHub,
);

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
  requireInternalRole(...mutatorRoles),
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
  requireInternalRole(...mutatorRoles),
  validate(hearingIdSchema, "params"),
  validate(updateHearingSchema),
  hearingController.updateHearing,
);

router.post(
  "/:hearingId/reschedule",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(...mutatorRoles),
  validate(hearingIdSchema, "params"),
  validate(rescheduleHearingSchema),
  hearingController.rescheduleHearing,
);

router.post(
  "/:hearingId/cancel",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(...mutatorRoles),
  validate(hearingIdSchema, "params"),
  validate(cancelHearingSchema),
  hearingController.cancelHearing,
);

router.post(
  "/:hearingId/zoom/retry",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(...mutatorRoles),
  validate(hearingIdSchema, "params"),
  hearingController.retryZoom,
);

router.post(
  "/:hearingId/zoom/manual-link",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(...mutatorRoles),
  validate(hearingIdSchema, "params"),
  validate(manualZoomLinkSchema),
  hearingController.setManualZoomLink,
);

router.post(
  "/:hearingId/calendar/retry",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(...mutatorRoles),
  validate(hearingIdSchema, "params"),
  hearingController.retryCalendarInvites,
);

module.exports = router;
module.exports.hubRouter = hubRouter;
