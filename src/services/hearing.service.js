const crypto = require("crypto");
const prisma = require("../config/prisma");
const hearingRepository = require("../repositories/hearing.repository");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");

const activeStatuses = ["PENDING", "CONFIRMED", "RESCHEDULED"];
const DEFAULT_WORKDAY_START = "09:00";
const DEFAULT_WORKDAY_END = "17:00";
const DEFAULT_SLOT_MINUTES = 30;

const createReference = () => `HRG-${crypto.randomUUID().toUpperCase()}`;

const getAuthorizedHearing = async (caseId, hearingId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const hearing = await hearingRepository.findHearingById(hearingId);
  if (!hearing || hearing.caseId !== caseId) throw new ApiError(404, "Hearing not found.");
  return hearing;
};

const resolveAttendees = async (caseId, neutralParticipantId, participantIds = [], tx = prisma) => {
  const ids = [...new Set([neutralParticipantId, ...participantIds])];
  const participants = await hearingRepository.findCaseParticipants(caseId, ids, tx);
  if (participants.length !== ids.length) throw new ApiError(400, "One or more participants do not belong to this case.");
  if (participants.some((participant) => participant.accessStatus !== "ACTIVE")) throw new ApiError(400, "Only active case participants can be scheduled.");
  const neutral = participants.find((participant) => participant.id === neutralParticipantId);
  if (!neutral || neutral.role !== "NEUTRAL") throw new ApiError(400, "Selected neutral must be an active neutral participant in this case.");
  return participants;
};

const mapConflicts = (hearings, proposedUserIds, location) => hearings.map((hearing) => ({
  hearingId: hearing.id,
  hearingReference: hearing.hearingReference,
  caseId: hearing.caseId,
  title: hearing.title,
  startTime: hearing.startTime,
  endTime: hearing.endTime,
  location: hearing.location,
  conflictTypes: [
    ...(hearing.attendees.some((attendee) => proposedUserIds.includes(attendee.caseParticipant.user.id)) ? ["PARTICIPANT"] : []),
    ...(location && hearing.location === location && ["IN_PERSON", "HYBRID"].includes(hearing.format) ? ["LOCATION"] : []),
  ],
}));

const createUtcDateTime = (date, time) => new Date(`${date}T${time}:00.000Z`);

const getAvailableSlots = async (caseId, data, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const participantIds = data.participantIds ? data.participantIds.split(",").filter(Boolean) : [];
  const attendees = await resolveAttendees(caseId, data.neutralParticipantId, participantIds);
  const workdayStart = createUtcDateTime(data.date, data.workdayStart || DEFAULT_WORKDAY_START);
  const workdayEnd = createUtcDateTime(data.date, data.workdayEnd || DEFAULT_WORKDAY_END);
  const durationMs = data.durationMinutes * 60 * 1000;
  const slotMs = (data.slotMinutes || DEFAULT_SLOT_MINUTES) * 60 * 1000;
  const conflicts = await hearingRepository.findConflictingHearings({
    startTime: workdayStart,
    endTime: workdayEnd,
    userIds: attendees.map((participant) => participant.userId),
    location: ["IN_PERSON", "HYBRID"].includes(data.format) ? data.location || null : null,
    excludeHearingId: data.excludeHearingId,
  });
  const availableSlots = [];

  for (let start = workdayStart.getTime(); start + durationMs <= workdayEnd.getTime(); start += slotMs) {
    const end = start + durationMs;
    if (!conflicts.some((hearing) => hearing.startTime < new Date(end) && hearing.endTime > new Date(start))) {
      availableSlots.push({ startTime: new Date(start), endTime: new Date(end) });
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

const checkAvailability = async (caseId, data, currentUser, tx = prisma, hasCaseAccess = false) => {
  if (!hasCaseAccess) await caseService.getCaseById(caseId, currentUser);
  const participantIds = Array.isArray(data.participantIds) ? data.participantIds : (data.participantIds ? data.participantIds.split(",").filter(Boolean) : []);
  const attendees = await resolveAttendees(caseId, data.neutralParticipantId, participantIds, tx);
  const conflicts = await hearingRepository.findConflictingHearings({
    startTime: new Date(data.startTime),
    endTime: new Date(data.endTime),
    userIds: attendees.map((participant) => participant.userId),
    location: ["IN_PERSON", "HYBRID"].includes(data.format) ? data.location || null : null,
    excludeHearingId: data.excludeHearingId,
  }, tx);
  return { available: conflicts.length === 0, conflicts: mapConflicts(conflicts, attendees.map((participant) => participant.userId), data.location || null), attendees };
};

const recordEvent = async (tx, { caseId, hearingId, eventType, summary, actorUserId, previousValue, newValue, reason }) => {
  await tx.caseTimelineEvent.create({ data: { caseId, eventType, relatedRecordType: "Hearing", relatedRecordId: hearingId, summary, actorUserId, previousValue: previousValue === undefined ? null : typeof previousValue === "string" ? previousValue : JSON.stringify(previousValue), newValue: newValue === undefined ? null : typeof newValue === "string" ? newValue : JSON.stringify(newValue) } });
  await tx.auditLog.create({ data: { actingUserId: actorUserId, action: eventType === "HEARING_SCHEDULED" ? "CREATE" : "EDIT", module: "CASES", affectedRecordType: "Hearing", affectedRecordId: hearingId, previousValue, newValue, reason: reason || null } });
};

const scheduleHearing = async (caseId, data, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  return prisma.$transaction(async (tx) => {
    const availability = await checkAvailability(caseId, data, currentUser, tx, true);
    if (!availability.available) throw new ApiError(409, "Scheduling conflict detected.", availability.conflicts);
    const hearing = await hearingRepository.createHearing({
      hearingReference: createReference(),
      caseId,
      type: data.type,
      title: data.title,
      format: data.format,
      location: data.location || null,
      hearingDate: new Date(data.startTime),
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      hearingStatus: "PENDING",
      conflictStatus: "CLEAR",
      attendees: { create: availability.attendees.map((participant) => ({ caseParticipantId: participant.id, side: participant.caseParty?.side || null })) },
    }, tx);
    await recordEvent(tx, { caseId, hearingId: hearing.id, eventType: "HEARING_SCHEDULED", summary: `${hearing.title} scheduled.`, actorUserId: currentUser.id, newValue: { startTime: hearing.startTime, endTime: hearing.endTime } });
    return hearing;
  }, { timeout: 15000 });
};

const getHearings = async (caseId, query, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const where = { caseId };
  if (query.hearingStatus) where.hearingStatus = query.hearingStatus;
  if (query.from || query.to) where.startTime = { ...(query.from && { gte: new Date(query.from) }), ...(query.to && { lte: new Date(query.to) }) };
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const [hearings, total] = await hearingRepository.getHearings({ where, skip: (page - 1) * limit, take: limit });
  const totalPages = Math.ceil(total / limit);
  return { hearings, pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 } };
};

const getHearing = (caseId, hearingId, currentUser) => getAuthorizedHearing(caseId, hearingId, currentUser);

const updateHearing = async (caseId, hearingId, data, currentUser) => {
  const hearing = await getAuthorizedHearing(caseId, hearingId, currentUser);
  if (!activeStatuses.includes(hearing.hearingStatus)) throw new ApiError(400, "Only active hearings can be updated.");
  return hearingRepository.updateHearing(hearingId, data);
};

const rescheduleHearing = async (caseId, hearingId, data, currentUser) => {
  const hearing = await getAuthorizedHearing(caseId, hearingId, currentUser);
  if (!activeStatuses.includes(hearing.hearingStatus)) throw new ApiError(400, "Only active hearings can be rescheduled.");
  return prisma.$transaction(async (tx) => {
    const availability = await checkAvailability(caseId, { ...data, excludeHearingId: hearingId, location: hearing.location, format: hearing.format }, currentUser, tx, true);
    if (!availability.available) throw new ApiError(409, "Scheduling conflict detected.", availability.conflicts);
    await tx.hearingAttendee.deleteMany({ where: { hearingId } });
    const updated = await hearingRepository.updateHearing(hearingId, {
      hearingDate: new Date(data.startTime),
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      hearingStatus: "RESCHEDULED",
      rescheduleReason: data.reason,
      attendees: { create: availability.attendees.map((participant) => ({ caseParticipantId: participant.id, side: participant.caseParty?.side || null })) },
    }, tx);
    await recordEvent(tx, { caseId, hearingId, eventType: "STATUS_CHANGED", summary: `${updated.title} rescheduled.`, actorUserId: currentUser.id, previousValue: { startTime: hearing.startTime, endTime: hearing.endTime }, newValue: { startTime: updated.startTime, endTime: updated.endTime }, reason: data.reason });
    return updated;
  }, { timeout: 15000 });
};

const cancelHearing = async (caseId, hearingId, reason, currentUser) => {
  const hearing = await getAuthorizedHearing(caseId, hearingId, currentUser);
  if (["CANCELLED", "COMPLETED"].includes(hearing.hearingStatus)) throw new ApiError(400, "This hearing cannot be cancelled.");
  return prisma.$transaction(async (tx) => {
    const updated = await hearingRepository.updateHearing(hearingId, { hearingStatus: "CANCELLED", cancelReason: reason }, tx);
    await recordEvent(tx, { caseId, hearingId, eventType: "STATUS_CHANGED", summary: `${updated.title} cancelled.`, actorUserId: currentUser.id, previousValue: hearing.hearingStatus, newValue: "CANCELLED", reason });
    return updated;
  }, { timeout: 15000 });
};

module.exports = { checkAvailability, getAvailableSlots, scheduleHearing, getHearings, getHearing, updateHearing, rescheduleHearing, cancelHearing };
