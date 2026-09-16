const Joi = require("joi");
const {
  HearingType,
  HearingFormat,
  HearingStatus,
  ZoomStatus,
  CalendarSyncStatus,
  ConflictStatus,
} = require("@prisma/client");

const timeRange = (schema) =>
  schema
    .custom((value, helpers) => {
      if (new Date(value.endTime) <= new Date(value.startTime))
        return helpers.error("any.invalid");
      return value;
    })
    .messages({ "any.invalid": "endTime must be later than startTime." });

const caseIdSchema = Joi.object({ caseId: Joi.string().uuid().required() });
const hearingIdSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  hearingId: Joi.string().uuid().required(),
});
const participantId = Joi.string().uuid();

const conflictOverrideFields = {
  overrideConflict: Joi.boolean().default(false),
  conflictOverrideReason: Joi.string().trim().min(2).max(1000).when(
    "overrideConflict",
    {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional().allow("", null),
    },
  ),
};

const scheduleHearingSchema = timeRange(
  Joi.object({
    type: Joi.string()
      .valid(...Object.values(HearingType))
      .required(),
    title: Joi.string().trim().min(2).max(255).required(),
    format: Joi.string()
      .valid(...Object.values(HearingFormat))
      .required(),
    location: Joi.string().trim().max(500).allow("", null).optional(),
    instructions: Joi.string().trim().max(5000).allow("", null).optional(),
    timezone: Joi.string().trim().max(100).optional(),
    durationMinutes: Joi.number().integer().min(15).max(720).optional(),
    startTime: Joi.date().iso().required(),
    endTime: Joi.date().iso().required(),
    neutralParticipantId: participantId.required(),
    participantIds: Joi.array().items(participantId).unique().default([]),
    autoCreateZoom: Joi.boolean().optional(),
    sendCalendarInvites: Joi.boolean().default(false),
    alternateHostUserId: Joi.string().uuid().allow(null).optional(),
    ...conflictOverrideFields,
  }),
);

const updateHearingSchema = Joi.object({
  title: Joi.string().trim().min(2).max(255).optional(),
  format: Joi.string()
    .valid(...Object.values(HearingFormat))
    .optional(),
  location: Joi.string().trim().max(500).allow("", null).optional(),
  instructions: Joi.string().trim().max(5000).allow("", null).optional(),
  timezone: Joi.string().trim().max(100).optional(),
}).min(1);

const rescheduleHearingSchema = timeRange(
  Joi.object({
    startTime: Joi.date().iso().required(),
    endTime: Joi.date().iso().required(),
    neutralParticipantId: participantId.required(),
    participantIds: Joi.array().items(participantId).unique().default([]),
    reason: Joi.string().trim().min(2).max(1000).required(),
    location: Joi.string().trim().max(500).allow("", null).optional(),
    format: Joi.string()
      .valid(...Object.values(HearingFormat))
      .optional(),
    timezone: Joi.string().trim().max(100).optional(),
    durationMinutes: Joi.number().integer().min(15).max(720).optional(),
    sendCalendarInvites: Joi.boolean().optional(),
    ...conflictOverrideFields,
  }),
);

const cancelHearingSchema = Joi.object({
  reason: Joi.string().trim().min(2).max(1000).required(),
});

const hearingFilterFields = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(255).allow("").optional(),
  hearingStatus: Joi.string()
    .valid(...Object.values(HearingStatus))
    .optional(),
  type: Joi.string()
    .valid(...Object.values(HearingType))
    .optional(),
  format: Joi.string()
    .valid(...Object.values(HearingFormat))
    .optional(),
  zoomStatus: Joi.string()
    .valid(...Object.values(ZoomStatus))
    .optional(),
  calendarSyncStatus: Joi.string()
    .valid(...Object.values(CalendarSyncStatus))
    .optional(),
  conflictStatus: Joi.string()
    .valid(...Object.values(ConflictStatus))
    .optional(),
  caseId: Joi.string().uuid().optional(),
  caseType: Joi.string().optional(),
  neutralParticipantId: Joi.string().uuid().optional(),
  neutralUserId: Joi.string().uuid().optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
};

const getHearingsSchema = Joi.object(hearingFilterFields);
const listHearingsHubSchema = Joi.object(hearingFilterFields);

const availabilitySchema = timeRange(
  Joi.object({
    startTime: Joi.date().iso().required(),
    endTime: Joi.date().iso().required(),
    format: Joi.string()
      .valid(...Object.values(HearingFormat))
      .required(),
    neutralParticipantId: participantId.required(),
    participantIds: Joi.string().trim().allow("").optional(),
    location: Joi.string().trim().max(500).allow("", null).optional(),
    excludeHearingId: Joi.string().uuid().optional(),
  }),
);

const timeOfDay = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/);
const availableSlotsSchema = Joi.object({
  date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .required(),
  durationMinutes: Joi.number().integer().min(15).max(720).required(),
  slotMinutes: Joi.number().integer().min(15).max(120).default(30),
  workdayStart: timeOfDay.default("09:00"),
  workdayEnd: timeOfDay.default("17:00"),
  format: Joi.string()
    .valid(...Object.values(HearingFormat))
    .required(),
  neutralParticipantId: participantId.required(),
  participantIds: Joi.string().trim().allow("").optional(),
  location: Joi.string().trim().max(500).allow("", null).optional(),
  excludeHearingId: Joi.string().uuid().optional(),
})
  .custom((value, helpers) => {
    if (value.workdayEnd <= value.workdayStart)
      return helpers.error("any.invalid");
    return value;
  })
  .messages({ "any.invalid": "workdayEnd must be later than workdayStart." });

const manualZoomLinkSchema = Joi.object({
  joinUrl: Joi.string().uri().required(),
  meetingId: Joi.string().trim().max(100).allow("", null).optional(),
  passcode: Joi.string().trim().max(100).allow("", null).optional(),
  startUrl: Joi.string().uri().allow("", null).optional(),
});

module.exports = {
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
};
