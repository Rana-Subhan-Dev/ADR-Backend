const crypto = require("crypto");
const prisma = require("../config/prisma");
const { runTransaction } = require("../config/prisma");
const hearingRepository = require("../repositories/hearing.repository");
const caseService = require("./case.service");
const { accessibleCaseRelationWhere } = require("../utils/caseAccess");
const zoomClient = require("./zoomClient.service");
const {
  sendHearingCalendarInvites,
} = require("./calendarInvite.service");
const ApiError = require("../utils/apiError");

const activeStatuses = ["PENDING", "CONFIRMED", "RESCHEDULED"];
const DEFAULT_WORKDAY_START = "09:00";
const DEFAULT_WORKDAY_END = "17:00";
const DEFAULT_SLOT_MINUTES = 30;
const OVERRIDE_ROLES = ["SUPER_ADMIN", "ADMIN_LEADERSHIP"];
const INTERNAL_ROLES = ["SUPER_ADMIN", "ADMIN_LEADERSHIP", "CASE_MANAGER"];
const EXTERNAL_ROLES = ["NEUTRAL", "LAWYER", "CLIENT"];

const createReference = () => `HRG-${crypto.randomUUID().toUpperCase()}`;

const canOverrideConflicts = (currentUser) =>
  OVERRIDE_ROLES.includes(currentUser.role?.name);

const isInternalUser = (currentUser) =>
  INTERNAL_ROLES.includes(currentUser.role?.name);

const durationFromRange = (startTime, endTime, explicit) => {
  if (explicit) return Number(explicit);
  return Math.max(
    15,
    Math.round(
      (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000,
    ),
  );
};

const wantsZoomMeeting = (format, autoCreateZoom) =>
  ["VIRTUAL", "HYBRID"].includes(format) && autoCreateZoom === true;

const getAuthorizedHearing = async (caseId, hearingId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const hearing = await hearingRepository.findHearingById(hearingId);
  if (!hearing || hearing.caseId !== caseId)
    throw new ApiError(404, "Hearing not found.");
  return hearing;
};

const resolveAttendees = async (
  caseId,
  neutralParticipantId,
  participantIds = [],
  tx = prisma,
) => {
  const ids = [...new Set([neutralParticipantId, ...participantIds])];
  const participants = await hearingRepository.findCaseParticipants(
    caseId,
    ids,
    tx,
  );
  if (participants.length !== ids.length)
    throw new ApiError(
      400,
      "One or more participants do not belong to this case.",
    );
  if (participants.some((participant) => participant.accessStatus !== "ACTIVE"))
    throw new ApiError(400, "Only active case participants can be scheduled.");
  const neutral = participants.find(
    (participant) => participant.id === neutralParticipantId,
  );
  if (!neutral || neutral.role !== "NEUTRAL")
    throw new ApiError(
      400,
      "Selected neutral must be an active neutral participant in this case.",
    );
  return participants;
};

const mapConflicts = (hearings, proposedUserIds, location) =>
  hearings.map((hearing) => ({
    hearingId: hearing.id,
    hearingReference: hearing.hearingReference,
    caseId: hearing.caseId,
    caseNumber: hearing.case?.caseNumber || null,
    title: hearing.title,
    startTime: hearing.startTime,
    endTime: hearing.endTime,
    location: hearing.location,
    conflictTypes: [
      ...(hearing.attendees.some((attendee) =>
        proposedUserIds.includes(attendee.caseParticipant.user.id),
      )
        ? ["PARTICIPANT"]
        : []),
      ...(location &&
      hearing.location === location &&
      ["IN_PERSON", "HYBRID"].includes(hearing.format)
        ? ["LOCATION"]
        : []),
    ],
  }));

const buildConflictError = ({
  proposed,
  conflicts,
  currentUser,
}) =>
  new ApiError(409, "Scheduling conflict detected.", {
    proposed,
    conflicts,
    canOverride: canOverrideConflicts(currentUser),
  });

const createUtcDateTime = (date, time) => new Date(`${date}T${time}:00.000Z`);

const formatPersonName = (user) => {
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || null;
};

const HEARING_TYPE_LABELS = {
  MEDIATION_SESSION: "Mediation Session",
  ARBITRATION_HEARING: "Arbitration Hearing",
  STATUS_CONFERENCE: "Status Conference",
  CUSTOM: "Custom",
};

const HEARING_TYPE_ALIASES = {
  PRELIMINARY_CONFERENCE: "STATUS_CONFERENCE",
  "PRELIMINARY CONFERENCE": "STATUS_CONFERENCE",
  PRELIMINARY: "STATUS_CONFERENCE",
};

const CONFLICT_ALIASES = {
  clear: "CLEAR",
  review: "NEEDS_REVIEW",
  needs_review: "NEEDS_REVIEW",
  "needs-review": "NEEDS_REVIEW",
  conflict: "CONFLICT",
};

const ZOOM_ALIASES = {
  ready: ["CREATED", "MANUALLY_LINKED"],
  setup: ["PENDING", "FAILED", "NOT_REQUIRED"],
  created: "CREATED",
  pending: "PENDING",
  failed: "FAILED",
  manually_linked: "MANUALLY_LINKED",
  "manually-linked": "MANUALLY_LINKED",
  not_required: "NOT_REQUIRED",
};

const CALENDAR_ALIASES = {
  synced: "SYNCED",
  failed: "FAILED",
  pending: "PENDING",
  not_synced: "NOT_SYNCED",
  "not-synced": "NOT_SYNCED",
};

const statusLabelPair = (value, labels = {}) =>
  value
    ? { value, label: labels[value] || String(value).replace(/_/g, " ") }
    : null;

const ZOOM_LABELS = {
  NOT_REQUIRED: "Not required",
  PENDING: "Pending",
  CREATED: "Ready",
  FAILED: "Failed",
  MANUALLY_LINKED: "Ready (manual)",
};

const CALENDAR_LABELS = {
  SYNCED: "Synced",
  PENDING: "Pending",
  FAILED: "Failed",
  NOT_SYNCED: "Not synced",
};

const CONFLICT_LABELS = {
  CLEAR: "Clear",
  NEEDS_REVIEW: "Needs review",
  CONFLICT: "Conflict",
};

const startOfUtcDay = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const addUtcDays = (date, days) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

const normalizeHearingQuery = (query = {}) => {
  const next = { ...query };

  if (next.type) {
    const raw = String(next.type).trim();
    const upper = raw.toUpperCase().replace(/[\s-]+/g, "_");
    next.type = HEARING_TYPE_ALIASES[upper] || HEARING_TYPE_ALIASES[raw.toUpperCase()] || upper;
  }

  if (next.conflictStatus) {
    const key = String(next.conflictStatus).trim().toLowerCase();
    next.conflictStatus =
      CONFLICT_ALIASES[key] || String(next.conflictStatus).toUpperCase();
  }

  if (next.zoomStatus) {
    const key = String(next.zoomStatus).trim().toLowerCase();
    next.zoomStatus = ZOOM_ALIASES[key] || String(next.zoomStatus).toUpperCase();
  }

  if (next.calendarSyncStatus) {
    const key = String(next.calendarSyncStatus).trim().toLowerCase();
    next.calendarSyncStatus =
      CALENDAR_ALIASES[key] || String(next.calendarSyncStatus).toUpperCase();
  }

  const preset = String(next.datePreset || next.range || "").toLowerCase();
  if (preset && !next.hearingDateFrom && !next.from && !next.dateFrom) {
    const start = startOfUtcDay(new Date());
    if (preset === "today") {
      next.hearingDateFrom = start.toISOString();
      next.hearingDateTo = addUtcDays(start, 1).toISOString();
    } else if (preset === "week") {
      next.hearingDateFrom = start.toISOString();
      next.hearingDateTo = addUtcDays(start, 7).toISOString();
    } else if (preset === "month") {
      next.hearingDateFrom = start.toISOString();
      next.hearingDateTo = addUtcDays(start, 30).toISOString();
    }
  }

  return next;
};

const mapAttendee = (attendee) => {
  const user = attendee.caseParticipant?.user;
  const party = attendee.caseParticipant?.caseParty;
  return {
    id: attendee.id,
    caseParticipantId: attendee.caseParticipant?.id || null,
    role: attendee.caseParticipant?.role || null,
    side: attendee.side || party?.side || null,
    attendanceStatus: attendee.attendanceStatus || null,
    notes: attendee.notes || null,
    name: formatPersonName(user),
    email: user?.email || null,
    phone: user?.phone || null,
    organizationName: party?.organizationName || null,
    user: user
      ? {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone || null,
        }
      : null,
  };
};

const sanitizeHearing = (hearing, currentUser) => {
  if (!hearing) return hearing;
  const role = currentUser.role?.name;
  const canSeeJoin =
    isInternalUser(currentUser) || EXTERNAL_ROLES.includes(role);
  const canSeeStart = isInternalUser(currentUser);
  const joinAllowed = ["CREATED", "MANUALLY_LINKED"].includes(
    hearing.zoomStatus,
  );

  const attendees = (hearing.attendees || []).map(mapAttendee);
  const presentCount = attendees.filter(
    (attendee) => attendee.attendanceStatus === "PRESENT",
  ).length;
  const neutrals = attendees.filter((attendee) => attendee.role === "NEUTRAL");
  const primaryNeutral = neutrals[0] || null;

  return {
    ...hearing,
    attendees,
    hearingTypeLabel: HEARING_TYPE_LABELS[hearing.type] || hearing.type,
    outcomeNotes: hearing.outcomeNotes ?? null,
    assignedNeutral: primaryNeutral
      ? {
          caseParticipantId: primaryNeutral.caseParticipantId,
          name: primaryNeutral.name,
          email: primaryNeutral.email,
          phone: primaryNeutral.phone,
          role: primaryNeutral.role,
        }
      : null,
    presentCount,
    attendeeCount: attendees.length,
    meeting: statusLabelPair(hearing.zoomStatus, ZOOM_LABELS),
    calendar: statusLabelPair(hearing.calendarSyncStatus, CALENDAR_LABELS),
    conflict: statusLabelPair(hearing.conflictStatus, CONFLICT_LABELS),
    zoomJoinUrl: canSeeJoin && joinAllowed ? hearing.zoomJoinUrl : null,
    zoomPasscode: canSeeJoin && joinAllowed ? hearing.zoomPasscode : null,
    zoomStartUrl: canSeeStart ? hearing.zoomStartUrl : null,
    zoomMeetingId: isInternalUser(currentUser) ? hearing.zoomMeetingId : null,
    zoomErrorMessage: isInternalUser(currentUser)
      ? hearing.zoomErrorMessage
      : null,
    statusOverview: {
      hearingStatus: hearing.hearingStatus,
      zoomStatus: hearing.zoomStatus,
      calendarSyncStatus: hearing.calendarSyncStatus,
      conflictStatus: hearing.conflictStatus,
    },
  };
};

const mapHearingListItem = (hearing, currentUser) => {
  const base = sanitizeHearing(hearing, currentUser);
  const neutralNames = (base.attendees || [])
    .filter((attendee) => attendee.role === "NEUTRAL")
    .map((attendee) => attendee.name)
    .filter(Boolean);

  return {
    ...base,
    caseNumber: hearing.case?.caseNumber ?? null,
    caseTitle: hearing.case?.title ?? null,
    hearingDate: hearing.hearingDate ?? null,
    location: hearing.location ?? null,
    durationMinutes: hearing.durationMinutes ?? null,
    hearingStatus: hearing.hearingStatus,
    type: hearing.type,
    title: hearing.title,
    neutralNames,
    neutralName: neutralNames[0] ?? null,
    participantCount: hearing.attendees?.length ?? 0,
  };
};

const getAvailableSlots = async (caseId, data, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const participantIds = data.participantIds
    ? data.participantIds.split(",").filter(Boolean)
    : [];
  const attendees = await resolveAttendees(
    caseId,
    data.neutralParticipantId,
    participantIds,
  );
  const workdayStart = createUtcDateTime(
    data.date,
    data.workdayStart || DEFAULT_WORKDAY_START,
  );
  const workdayEnd = createUtcDateTime(
    data.date,
    data.workdayEnd || DEFAULT_WORKDAY_END,
  );
  const durationMs = data.durationMinutes * 60 * 1000;
  const slotMs = (data.slotMinutes || DEFAULT_SLOT_MINUTES) * 60 * 1000;
  const conflicts = await hearingRepository.findConflictingHearings({
    startTime: workdayStart,
    endTime: workdayEnd,
    userIds: attendees.map((participant) => participant.userId),
    location: ["IN_PERSON", "HYBRID"].includes(data.format)
      ? data.location || null
      : null,
    excludeHearingId: data.excludeHearingId,
  });
  const availableSlots = [];

  for (
    let start = workdayStart.getTime();
    start + durationMs <= workdayEnd.getTime();
    start += slotMs
  ) {
    const end = start + durationMs;
    if (
      !conflicts.some(
        (hearing) =>
          hearing.startTime < new Date(end) &&
          hearing.endTime > new Date(start),
      )
    ) {
      availableSlots.push({
        startTime: new Date(start),
        endTime: new Date(end),
      });
    }
  }

  return {
    date: data.date,
    durationMinutes: data.durationMinutes,
    slotMinutes: data.slotMinutes || DEFAULT_SLOT_MINUTES,
    workdayStart,
    workdayEnd,
    availableSlots,
  };
};

const checkAvailability = async (
  caseId,
  data,
  currentUser,
  tx = prisma,
  hasCaseAccess = false,
) => {
  if (!hasCaseAccess) await caseService.getCaseById(caseId, currentUser);
  const participantIds = Array.isArray(data.participantIds)
    ? data.participantIds
    : data.participantIds
      ? data.participantIds.split(",").filter(Boolean)
      : [];
  const attendees = await resolveAttendees(
    caseId,
    data.neutralParticipantId,
    participantIds,
    tx,
  );
  const conflicts = await hearingRepository.findConflictingHearings(
    {
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      userIds: attendees.map((participant) => participant.userId),
      location: ["IN_PERSON", "HYBRID"].includes(data.format)
        ? data.location || null
        : null,
      excludeHearingId: data.excludeHearingId,
    },
    tx,
  );
  return {
    available: conflicts.length === 0,
    conflicts: mapConflicts(
      conflicts,
      attendees.map((participant) => participant.userId),
      data.location || null,
    ),
    attendees,
    canOverride: canOverrideConflicts(currentUser),
  };
};

const recordEvent = async (
  tx,
  {
    caseId,
    hearingId,
    eventType,
    summary,
    actorUserId,
    actorUserRole,
    previousValue,
    newValue,
    reason,
  },
) => {
  await tx.caseTimelineEvent.create({
    data: {
      caseId,
      eventType,
      relatedRecordType: "Hearing",
      relatedRecordId: hearingId,
      summary,
      actorUserId,
      previousValue:
        previousValue === undefined
          ? null
          : typeof previousValue === "string"
            ? previousValue
            : JSON.stringify(previousValue),
      newValue:
        newValue === undefined
          ? null
          : typeof newValue === "string"
            ? newValue
            : JSON.stringify(newValue),
    },
  });
  await tx.auditLog.create({
    data: {
      actingUserId: actorUserId,
      actingUserRoleSnapshot: actorUserRole || null,
      action: eventType === "HEARING_SCHEDULED" ? "CREATE" : "EDIT",
      module: "CASES",
      affectedRecordType: "Hearing",
      affectedRecordId: hearingId,
      previousValue,
      newValue,
      reason: reason || null,
    },
  });
};

const resolveAlternateHostEmail = async (userId, tx = prisma) => {
  if (!userId) return null;
  const user = await hearingRepository.findUserEmail(userId, tx);
  return user?.email || null;
};

const applyZoomCreate = async (hearing, { timezone, alternateHostEmail }) => {
  try {
    const meeting = await zoomClient.createMeeting({
      topic: hearing.title,
      startTime: hearing.startTime,
      durationMinutes: hearing.durationMinutes,
      timezone: timezone || hearing.timezone || "America/New_York",
      alternateHostEmails: alternateHostEmail ? [alternateHostEmail] : [],
    });
    return {
      zoomMeetingId: String(meeting.id),
      zoomJoinUrl: meeting.join_url || null,
      zoomStartUrl: meeting.start_url || null,
      zoomPasscode: meeting.password || meeting.encrypted_password || null,
      zoomStatus: "CREATED",
      zoomErrorMessage: null,
    };
  } catch (error) {
    return {
      zoomMeetingId: null,
      zoomJoinUrl: null,
      zoomStartUrl: null,
      zoomPasscode: null,
      zoomStatus: "FAILED",
      zoomErrorMessage: error.message || "Zoom meeting creation failed.",
    };
  }
};

const applyCalendarInvites = async (hearing, method = "REQUEST") => {
  if (!hearing.sendCalendarInvites) {
    return { calendarSyncStatus: hearing.calendarSyncStatus || "NOT_SYNCED" };
  }
  const result = await sendHearingCalendarInvites({
    hearing,
    recipients: hearing.attendees || [],
    method,
  });
  if (result.sent > 0 && result.failed === 0)
    return { calendarSyncStatus: "SYNCED" };
  if (result.sent > 0) return { calendarSyncStatus: "PENDING" };
  return { calendarSyncStatus: "FAILED" };
};

const scheduleHearing = async (caseId, data, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const normalized = normalizeHearingQuery({ type: data.type });
  const hearingType = normalized.type;
  const durationMinutes = durationFromRange(
    data.startTime,
    data.endTime,
    data.durationMinutes,
  );
  const autoCreateZoom =
    data.autoCreateZoom === true ||
    (data.autoCreateZoom !== false &&
      ["VIRTUAL", "HYBRID"].includes(data.format));
  const sendCalendarInvites = data.sendCalendarInvites === true;

  const hearing = await runTransaction(
    async (tx) => {
      const availability = await checkAvailability(
        caseId,
        data,
        currentUser,
        tx,
        true,
      );
      const hasConflict = !availability.available;
      if (hasConflict) {
        if (!(data.overrideConflict && canOverrideConflicts(currentUser))) {
          throw buildConflictError({
            proposed: {
              title: data.title,
              startTime: data.startTime,
              endTime: data.endTime,
              format: data.format,
              location: data.location || null,
            },
            conflicts: availability.conflicts,
            currentUser,
          });
        }
        if (!data.conflictOverrideReason) {
          throw new ApiError(
            400,
            "conflictOverrideReason is required when overriding a conflict.",
          );
        }
      }

      let zoomStatus = null;
      if (data.format === "IN_PERSON") zoomStatus = "NOT_REQUIRED";
      else if (wantsZoomMeeting(data.format, autoCreateZoom))
        zoomStatus = "PENDING";

      const created = await hearingRepository.createHearing(
        {
          hearingReference: createReference(),
          caseId,
          type: hearingType,
          title: data.title,
          format: data.format,
          location: data.location || null,
          instructions: data.instructions || null,
          timezone: data.timezone || "America/New_York",
          durationMinutes,
          hearingDate: new Date(data.startTime),
          startTime: new Date(data.startTime),
          endTime: new Date(data.endTime),
          hearingStatus: "PENDING",
          conflictStatus: hasConflict ? "NEEDS_REVIEW" : "CLEAR",
          conflictOverrideReason: hasConflict
            ? data.conflictOverrideReason
            : null,
          autoCreateZoom:
            data.format === "IN_PERSON" ? false : Boolean(autoCreateZoom),
          sendCalendarInvites,
          calendarSyncStatus: sendCalendarInvites ? "PENDING" : "NOT_SYNCED",
          zoomStatus,
          zoomAlternateHostUserId: data.alternateHostUserId || null,
          attendees: {
            create: availability.attendees.map((participant) => ({
              caseParticipantId: participant.id,
              side: participant.caseParty?.side || null,
            })),
          },
        },
        tx,
      );
      await recordEvent(tx, {
        caseId,
        hearingId: created.id,
        eventType: "HEARING_SCHEDULED",
        summary: `${created.title} scheduled.`,
        actorUserId: currentUser.id,
        actorUserRole: currentUser.role?.name,
        newValue: {
          startTime: created.startTime,
          endTime: created.endTime,
          conflictOverride: hasConflict,
        },
        reason: hasConflict ? data.conflictOverrideReason : null,
      });
      return created;
    },
    { timeout: 15000 },
  );

  let updated = hearing;

  if (wantsZoomMeeting(hearing.format, hearing.autoCreateZoom)) {
    const alternateHostEmail = await resolveAlternateHostEmail(
      hearing.zoomAlternateHostUserId,
    );
    const zoomFields = await applyZoomCreate(hearing, {
      timezone: hearing.timezone,
      alternateHostEmail,
    });
    updated = await hearingRepository.updateHearing(hearing.id, zoomFields);
    await runTransaction(async (tx) => {
      await recordEvent(tx, {
        caseId,
        hearingId: hearing.id,
        eventType: "ZOOM_LINK_GENERATED",
        summary:
          zoomFields.zoomStatus === "CREATED"
            ? `Zoom meeting created for ${hearing.title}.`
            : `Zoom meeting creation failed for ${hearing.title}.`,
        actorUserId: currentUser.id,
        actorUserRole: currentUser.role?.name,
        newValue: {
          zoomStatus: zoomFields.zoomStatus,
          zoomMeetingId: zoomFields.zoomMeetingId,
          zoomErrorMessage: zoomFields.zoomErrorMessage,
        },
      });
    });
  }

  if (sendCalendarInvites) {
    const fresh = await hearingRepository.findHearingById(updated.id);
    const calendarFields = await applyCalendarInvites(fresh, "REQUEST");
    updated = await hearingRepository.updateHearing(updated.id, calendarFields);
    if (calendarFields.calendarSyncStatus === "SYNCED") {
      await runTransaction(async (tx) => {
        await recordEvent(tx, {
          caseId,
          hearingId: updated.id,
          eventType: "CALENDAR_INVITE_SENT",
          summary: `Calendar invites sent for ${updated.title}.`,
          actorUserId: currentUser.id,
        actorUserRole: currentUser.role?.name,
          newValue: { calendarSyncStatus: "SYNCED" },
        });
      });
    }
  }

  return sanitizeHearing(
    await hearingRepository.findHearingById(updated.id),
    currentUser,
  );
};

const buildHearingWhere = (rawQuery, caseScope) => {
  const query = normalizeHearingQuery(rawQuery);
  const where = { ...caseScope };
  if (query.hearingStatus) where.hearingStatus = query.hearingStatus;
  if (query.type) where.type = query.type;
  if (query.format) where.format = query.format;
  if (query.zoomStatus) {
    where.zoomStatus = Array.isArray(query.zoomStatus)
      ? { in: query.zoomStatus }
      : query.zoomStatus;
  }
  if (query.calendarSyncStatus)
    where.calendarSyncStatus = query.calendarSyncStatus;
  if (query.conflictStatus) where.conflictStatus = query.conflictStatus;
  if (query.caseId) where.caseId = query.caseId;
  if (query.caseType) where.case = { ...(where.case || {}), caseType: query.caseType };
  if (query.neutralParticipantId || query.neutralUserId) {
    where.attendees = {
      some: {
        caseParticipant: {
          role: "NEUTRAL",
          ...(query.neutralParticipantId && {
            id: query.neutralParticipantId,
          }),
          ...(query.neutralUserId && { userId: query.neutralUserId }),
        },
      },
    };
  }
  const hearingDateFrom =
    query.hearingDateFrom || query.from || query.dateFrom;
  const hearingDateTo = query.hearingDateTo || query.to || query.dateTo;
  if (hearingDateFrom || hearingDateTo) {
    where.startTime = {
      ...(hearingDateFrom ? { gte: new Date(hearingDateFrom) } : {}),
      ...(hearingDateTo ? { lte: new Date(hearingDateTo) } : {}),
    };
  }
  if (query.search) {
    const term = query.search;
    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      { hearingReference: { contains: term, mode: "insensitive" } },
      { case: { caseNumber: { contains: term, mode: "insensitive" } } },
      { case: { title: { contains: term, mode: "insensitive" } } },
      {
        attendees: {
          some: {
            caseParticipant: {
              user: {
                OR: [
                  { firstName: { contains: term, mode: "insensitive" } },
                  { lastName: { contains: term, mode: "insensitive" } },
                  { email: { contains: term, mode: "insensitive" } },
                ],
              },
            },
          },
        },
      },
    ];
  }
  return where;
};

const paginateHearings = async (where, query, currentUser, { listShape = false } = {}) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const [hearings, total] = await hearingRepository.getHearings({
    where,
    skip: (page - 1) * limit,
    take: limit,
  });
  const totalPages = Math.ceil(total / limit) || 1;
  const mapItem = listShape ? mapHearingListItem : sanitizeHearing;
  return {
    hearings: hearings.map((hearing) => mapItem(hearing, currentUser)),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

const getHearings = async (caseId, query, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  return paginateHearings(
    buildHearingWhere(query, { caseId }),
    query,
    currentUser,
    { listShape: true },
  );
};

const listHearingsHub = async (query, currentUser) => {
  const caseScope = accessibleCaseRelationWhere(currentUser);
  return paginateHearings(
    buildHearingWhere(query, caseScope),
    query,
    currentUser,
    { listShape: true },
  );
};

const getHearing = async (caseId, hearingId, currentUser) => {
  const hearing = await getAuthorizedHearing(caseId, hearingId, currentUser);
  const activity = await hearingRepository.findHearingTimeline(
    caseId,
    hearingId,
  );
  const sanitized = sanitizeHearing(hearing, currentUser);
  return {
    ...sanitized,
    activity,
    timeline: activity,
  };
};

const getHearingById = async (hearingId, currentUser) => {
  const hearing = await hearingRepository.findHearingById(hearingId);
  if (!hearing) throw new ApiError(404, "Hearing not found.");
  await caseService.getCaseById(hearing.caseId, currentUser);
  const activity = await hearingRepository.findHearingTimeline(
    hearing.caseId,
    hearingId,
  );
  const sanitized = sanitizeHearing(hearing, currentUser);
  return {
    ...sanitized,
    activity,
    timeline: activity,
  };
};

const updateHearing = async (caseId, hearingId, data, currentUser) => {
  const hearing = await getAuthorizedHearing(caseId, hearingId, currentUser);
  if (!activeStatuses.includes(hearing.hearingStatus))
    throw new ApiError(400, "Only active hearings can be updated.");
  const updated = await hearingRepository.updateHearing(hearingId, {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.format !== undefined && { format: data.format }),
    ...(data.location !== undefined && { location: data.location || null }),
    ...(data.instructions !== undefined && {
      instructions: data.instructions || null,
    }),
    ...(data.outcomeNotes !== undefined && {
      outcomeNotes: data.outcomeNotes || null,
    }),
    ...(data.timezone !== undefined && { timezone: data.timezone }),
  });
  return sanitizeHearing(updated, currentUser);
};

const updateAttendance = async (caseId, hearingId, data, currentUser) => {
  await getAuthorizedHearing(caseId, hearingId, currentUser);
  const attendees = data.attendees || [];
  if (!attendees.length) {
    throw new ApiError(400, "At least one attendee attendance update is required.");
  }

  await runTransaction(async (tx) => {
    for (const row of attendees) {
      try {
        await hearingRepository.updateAttendeeAttendance(
          hearingId,
          row.caseParticipantId,
          row.attendanceStatus,
          tx,
        );
      } catch (error) {
        if (error?.code === "P2025") {
          throw new ApiError(
            404,
            `Attendee ${row.caseParticipantId} not found on this hearing.`,
          );
        }
        throw error;
      }
    }
  });

  return getHearing(caseId, hearingId, currentUser);
};

const rescheduleHearing = async (caseId, hearingId, data, currentUser) => {
  const hearing = await getAuthorizedHearing(caseId, hearingId, currentUser);
  if (!activeStatuses.includes(hearing.hearingStatus))
    throw new ApiError(400, "Only active hearings can be rescheduled.");

  const durationMinutes = durationFromRange(
    data.startTime,
    data.endTime,
    data.durationMinutes || hearing.durationMinutes,
  );
  const sendCalendarInvites =
    data.sendCalendarInvites === true ||
    (data.sendCalendarInvites !== false && hearing.sendCalendarInvites);

  const updated = await runTransaction(
    async (tx) => {
      const availability = await checkAvailability(
        caseId,
        {
          ...data,
          excludeHearingId: hearingId,
          location: data.location !== undefined ? data.location : hearing.location,
          format: data.format || hearing.format,
        },
        currentUser,
        tx,
        true,
      );
      const hasConflict = !availability.available;
      if (hasConflict) {
        if (!(data.overrideConflict && canOverrideConflicts(currentUser))) {
          throw buildConflictError({
            proposed: {
              hearingId,
              title: hearing.title,
              startTime: data.startTime,
              endTime: data.endTime,
              format: data.format || hearing.format,
              location:
                data.location !== undefined ? data.location : hearing.location,
            },
            conflicts: availability.conflicts,
            currentUser,
          });
        }
        if (!data.conflictOverrideReason) {
          throw new ApiError(
            400,
            "conflictOverrideReason is required when overriding a conflict.",
          );
        }
      }

      await tx.hearingAttendee.deleteMany({ where: { hearingId } });
      const next = await hearingRepository.updateHearing(
        hearingId,
        {
          hearingDate: new Date(data.startTime),
          startTime: new Date(data.startTime),
          endTime: new Date(data.endTime),
          durationMinutes,
          hearingStatus: "RESCHEDULED",
          rescheduleReason: data.reason,
          conflictStatus: hasConflict ? "NEEDS_REVIEW" : "CLEAR",
          conflictOverrideReason: hasConflict
            ? data.conflictOverrideReason
            : null,
          ...(data.timezone && { timezone: data.timezone }),
          ...(data.location !== undefined && {
            location: data.location || null,
          }),
          sendCalendarInvites,
          calendarSyncStatus: sendCalendarInvites
            ? "PENDING"
            : hearing.calendarSyncStatus,
          attendees: {
            create: availability.attendees.map((participant) => ({
              caseParticipantId: participant.id,
              side: participant.caseParty?.side || null,
            })),
          },
        },
        tx,
      );
      await recordEvent(tx, {
        caseId,
        hearingId,
        eventType: "STATUS_CHANGED",
        summary: `${next.title} rescheduled.`,
        actorUserId: currentUser.id,
        actorUserRole: currentUser.role?.name,
        previousValue: {
          startTime: hearing.startTime,
          endTime: hearing.endTime,
        },
        newValue: { startTime: next.startTime, endTime: next.endTime },
        reason: data.reason,
      });
      return next;
    },
    { timeout: 15000 },
  );

  let result = updated;
  if (hearing.zoomMeetingId && ["CREATED", "MANUALLY_LINKED"].includes(hearing.zoomStatus)) {
    try {
      await zoomClient.updateMeeting(hearing.zoomMeetingId, {
        topic: updated.title,
        startTime: updated.startTime,
        durationMinutes: updated.durationMinutes,
        timezone: updated.timezone,
      });
    } catch {
      try {
        await zoomClient.deleteMeeting(hearing.zoomMeetingId);
      } catch {
        /* ignore */
      }
      const alternateHostEmail = await resolveAlternateHostEmail(
        updated.zoomAlternateHostUserId,
      );
      const zoomFields = await applyZoomCreate(updated, {
        timezone: updated.timezone,
        alternateHostEmail,
      });
      result = await hearingRepository.updateHearing(hearingId, zoomFields);
    }
  } else if (
    wantsZoomMeeting(updated.format, updated.autoCreateZoom) &&
    !hearing.zoomMeetingId
  ) {
    const alternateHostEmail = await resolveAlternateHostEmail(
      updated.zoomAlternateHostUserId,
    );
    const zoomFields = await applyZoomCreate(updated, {
      timezone: updated.timezone,
      alternateHostEmail,
    });
    result = await hearingRepository.updateHearing(hearingId, zoomFields);
  }

  if (sendCalendarInvites) {
    const fresh = await hearingRepository.findHearingById(result.id);
    const calendarFields = await applyCalendarInvites(fresh, "REQUEST");
    result = await hearingRepository.updateHearing(result.id, calendarFields);
    if (calendarFields.calendarSyncStatus === "SYNCED") {
      await runTransaction(async (tx) => {
        await recordEvent(tx, {
          caseId,
          hearingId: result.id,
          eventType: "CALENDAR_INVITE_SENT",
          summary: `Calendar invites re-sent for ${result.title}.`,
          actorUserId: currentUser.id,
        actorUserRole: currentUser.role?.name,
          newValue: { calendarSyncStatus: "SYNCED" },
        });
      });
    }
  }

  return sanitizeHearing(
    await hearingRepository.findHearingById(result.id),
    currentUser,
  );
};

const cancelHearing = async (caseId, hearingId, reason, currentUser) => {
  const hearing = await getAuthorizedHearing(caseId, hearingId, currentUser);
  if (["CANCELLED", "COMPLETED"].includes(hearing.hearingStatus))
    throw new ApiError(400, "This hearing cannot be cancelled.");

  if (hearing.zoomMeetingId) {
    try {
      await zoomClient.deleteMeeting(hearing.zoomMeetingId);
    } catch {
      /* meeting may already be gone */
    }
  }

  if (hearing.sendCalendarInvites) {
    await sendHearingCalendarInvites({
      hearing,
      recipients: hearing.attendees || [],
      method: "CANCEL",
      sequence: 1,
    });
  }

  const updated = await runTransaction(
    async (tx) => {
      const next = await hearingRepository.updateHearing(
        hearingId,
        {
          hearingStatus: "CANCELLED",
          cancelReason: reason,
          calendarSyncStatus: hearing.sendCalendarInvites
            ? "SYNCED"
            : hearing.calendarSyncStatus,
        },
        tx,
      );
      await recordEvent(tx, {
        caseId,
        hearingId,
        eventType: "STATUS_CHANGED",
        summary: `${next.title} cancelled.`,
        actorUserId: currentUser.id,
        actorUserRole: currentUser.role?.name,
        previousValue: hearing.hearingStatus,
        newValue: "CANCELLED",
        reason,
      });
      return next;
    },
    { timeout: 15000 },
  );

  return sanitizeHearing(updated, currentUser);
};

const retryZoom = async (caseId, hearingId, currentUser) => {
  const hearing = await getAuthorizedHearing(caseId, hearingId, currentUser);
  if (!["VIRTUAL", "HYBRID"].includes(hearing.format))
    throw new ApiError(400, "Zoom is only available for virtual or hybrid hearings.");
  if (
    hearing.zoomStatus === "CREATED" &&
    hearing.zoomMeetingId &&
    hearing.zoomJoinUrl
  )
    throw new ApiError(400, "Zoom meeting already exists. Use manual link to replace.");

  if (hearing.zoomMeetingId) {
    try {
      await zoomClient.deleteMeeting(hearing.zoomMeetingId);
    } catch {
      /* ignore */
    }
  }

  await hearingRepository.updateHearing(hearingId, {
    zoomStatus: "PENDING",
    zoomErrorMessage: null,
    autoCreateZoom: true,
  });

  const alternateHostEmail = await resolveAlternateHostEmail(
    hearing.zoomAlternateHostUserId,
  );
  const zoomFields = await applyZoomCreate(
    { ...hearing, autoCreateZoom: true },
    { timezone: hearing.timezone, alternateHostEmail },
  );
  const updated = await hearingRepository.updateHearing(hearingId, zoomFields);

  await runTransaction(async (tx) => {
    await recordEvent(tx, {
      caseId,
      hearingId,
      eventType: "ZOOM_LINK_GENERATED",
      summary:
        zoomFields.zoomStatus === "CREATED"
          ? `Zoom meeting re-created for ${hearing.title}.`
          : `Zoom retry failed for ${hearing.title}.`,
      actorUserId: currentUser.id,
        actorUserRole: currentUser.role?.name,
      newValue: zoomFields,
    });
  });

  return sanitizeHearing(updated, currentUser);
};

const setManualZoomLink = async (caseId, hearingId, data, currentUser) => {
  const hearing = await getAuthorizedHearing(caseId, hearingId, currentUser);
  if (!["VIRTUAL", "HYBRID"].includes(hearing.format))
    throw new ApiError(400, "Zoom is only available for virtual or hybrid hearings.");

  if (hearing.zoomMeetingId && hearing.zoomStatus === "CREATED") {
    try {
      await zoomClient.deleteMeeting(hearing.zoomMeetingId);
    } catch {
      /* ignore */
    }
  }

  const updated = await hearingRepository.updateHearing(hearingId, {
    zoomJoinUrl: data.joinUrl,
    zoomMeetingId: data.meetingId || null,
    zoomPasscode: data.passcode || null,
    zoomStartUrl: data.startUrl || null,
    zoomStatus: "MANUALLY_LINKED",
    zoomErrorMessage: null,
    autoCreateZoom: false,
  });

  await runTransaction(async (tx) => {
    await recordEvent(tx, {
      caseId,
      hearingId,
      eventType: "ZOOM_LINK_GENERATED",
      summary: `Manual Zoom link set for ${hearing.title}.`,
      actorUserId: currentUser.id,
        actorUserRole: currentUser.role?.name,
      newValue: {
        zoomStatus: "MANUALLY_LINKED",
        zoomJoinUrl: data.joinUrl,
      },
    });
  });

  return sanitizeHearing(updated, currentUser);
};

const retryCalendarInvites = async (caseId, hearingId, currentUser) => {
  const hearing = await getAuthorizedHearing(caseId, hearingId, currentUser);
  if (!activeStatuses.includes(hearing.hearingStatus))
    throw new ApiError(400, "Cannot send calendar invites for this hearing.");

  const withFlag = {
    ...hearing,
    sendCalendarInvites: true,
  };
  const calendarFields = await applyCalendarInvites(withFlag, "REQUEST");
  const updated = await hearingRepository.updateHearing(hearingId, {
    ...calendarFields,
    sendCalendarInvites: true,
  });

  if (calendarFields.calendarSyncStatus === "SYNCED") {
    await runTransaction(async (tx) => {
      await recordEvent(tx, {
        caseId,
        hearingId,
        eventType: "CALENDAR_INVITE_SENT",
        summary: `Calendar invites re-sent for ${hearing.title}.`,
        actorUserId: currentUser.id,
        actorUserRole: currentUser.role?.name,
        newValue: { calendarSyncStatus: "SYNCED" },
      });
    });
  }

  return sanitizeHearing(updated, currentUser);
};

module.exports = {
  checkAvailability,
  getAvailableSlots,
  scheduleHearing,
  getHearings,
  listHearingsHub,
  getHearing,
  getHearingById,
  updateHearing,
  updateAttendance,
  rescheduleHearing,
  cancelHearing,
  retryZoom,
  setManualZoomLink,
  retryCalendarInvites,
};
