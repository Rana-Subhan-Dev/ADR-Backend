const prisma = require("../config/prisma");

const hearingSelect = {
  id: true,
  caseId: true,
  hearingReference: true,
  type: true,
  title: true,
  format: true,
  holdingDate: true,
  dateConfirmed: true,
  hearingDate: true,
  startTime: true,
  endTime: true,
  location: true,
  instructions: true,
  outcomeNotes: true,
  timezone: true,
  durationMinutes: true,
  hearingStatus: true,
  calendarProvider: true,
  calendarEventId: true,
  calendarSyncStatus: true,
  sendCalendarInvites: true,
  autoCreateZoom: true,
  zoomMeetingId: true,
  zoomJoinUrl: true,
  zoomStartUrl: true,
  zoomPasscode: true,
  zoomStatus: true,
  zoomErrorMessage: true,
  zoomAlternateHostUserId: true,
  conflictStatus: true,
  conflictOverrideReason: true,
  rescheduleReason: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
  case: {
    select: {
      id: true,
      caseNumber: true,
      title: true,
      caseType: true,
    },
  },
  attendees: {
    select: {
      id: true,
      side: true,
      attendanceStatus: true,
      notes: true,
      caseParticipant: {
        select: {
          id: true,
          role: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          caseParty: {
            select: {
              id: true,
              side: true,
              organizationName: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  },
};

const findHearingById = (id, tx = prisma) =>
  tx.hearing.findUnique({ where: { id }, select: hearingSelect });

const getHearings = ({ where, skip, take }) =>
  prisma.$transaction([
    prisma.hearing.findMany({
      where,
      skip,
      take,
      orderBy: { startTime: "asc" },
      select: hearingSelect,
    }),
    prisma.hearing.count({ where }),
  ]);

const createHearing = (data, tx = prisma) =>
  tx.hearing.create({ data, select: hearingSelect });
const updateHearing = (id, data, tx = prisma) =>
  tx.hearing.update({ where: { id }, data, select: hearingSelect });

const updateAttendeeAttendance = (
  hearingId,
  caseParticipantId,
  attendanceStatus,
  tx = prisma,
) =>
  tx.hearingAttendee.update({
    where: {
      hearingId_caseParticipantId: { hearingId, caseParticipantId },
    },
    data: { attendanceStatus },
    select: {
      id: true,
      attendanceStatus: true,
      caseParticipantId: true,
    },
  });

const findCaseParticipants = (caseId, ids, tx = prisma) =>
  tx.caseParticipant.findMany({
    where: { caseId, id: { in: ids } },
    select: {
      id: true,
      userId: true,
      role: true,
      accessStatus: true,
      caseParty: { select: { side: true } },
      user: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
    },
  });

const findAlternateHostCandidate = (caseId, userId, tx = prisma) =>
  tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      userType: true,
      status: true,
      role: { select: { name: true } },
      caseParticipations: {
        where: {
          caseId,
          accessStatus: "ACTIVE",
        },
        select: {
          id: true,
          role: true,
        },
      },
    },
  });

const findConflictingHearings = (
  { startTime, endTime, userIds, location, excludeHearingId },
  tx = prisma,
) => {
  const filters = [
    { startTime: { lt: endTime } },
    { endTime: { gt: startTime } },
    { hearingStatus: { in: ["PENDING", "CONFIRMED", "RESCHEDULED"] } },
  ];
  if (excludeHearingId) filters.push({ id: { not: excludeHearingId } });
  const OR = [
    { attendees: { some: { caseParticipant: { userId: { in: userIds } } } } },
  ];
  if (location) OR.push({ location, format: { in: ["IN_PERSON", "HYBRID"] } });
  return tx.hearing.findMany({
    where: { AND: filters, OR },
    select: hearingSelect,
  });
};

const findHearingTimeline = (caseId, hearingId, tx = prisma) =>
  tx.caseTimelineEvent.findMany({
    where: {
      caseId,
      relatedRecordType: "Hearing",
      relatedRecordId: hearingId,
    },
    orderBy: { timestamp: "desc" },
    take: 50,
    select: {
      id: true,
      eventType: true,
      summary: true,
      previousValue: true,
      newValue: true,
      actorUserId: true,
      timestamp: true,
      actor: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });

module.exports = {
  hearingSelect,
  findHearingById,
  getHearings,
  createHearing,
  updateHearing,
  updateAttendeeAttendance,
  findCaseParticipants,
  findAlternateHostCandidate,
  findConflictingHearings,
  findHearingTimeline,
};
