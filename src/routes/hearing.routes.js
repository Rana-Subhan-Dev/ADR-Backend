const express = require("express");
const hearingController = require("../controllers/hearing.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
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
  validate(caseIdSchema, "params"),
  validate(availabilitySchema, "query"),
  hearingController.checkAvailability,
);

router.get(
  "/availability-slots",
  validate(caseIdSchema, "params"),
  validate(availableSlotsSchema, "query"),
  hearingController.getAvailableSlots,
);

router.post(
  "/",
  validate(caseIdSchema, "params"),
  validate(scheduleHearingSchema),
  hearingController.scheduleHearing,
);

router.get(
  "/",
  validate(caseIdSchema, "params"),
  validate(getHearingsSchema, "query"),
  hearingController.getHearings,
);

router.get(
  "/:hearingId",
  validate(hearingIdSchema, "params"),
  hearingController.getHearing,
);

router.patch(
  "/:hearingId",
  validate(hearingIdSchema, "params"),
  validate(updateHearingSchema),
  hearingController.updateHearing,
);

router.post(
  "/:hearingId/reschedule",
  validate(hearingIdSchema, "params"),
  validate(rescheduleHearingSchema),
  hearingController.rescheduleHearing,
);

router.post(
  "/:hearingId/cancel",
  validate(hearingIdSchema, "params"),
  validate(cancelHearingSchema),
  hearingController.cancelHearing,
);

module.exports = router;
