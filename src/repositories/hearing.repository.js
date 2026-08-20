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
  hearingStatus: true,
  calendarProvider: true,
  calendarEventId: true,
  calendarSyncStatus: true,
  zoomMeetingId: true,
  zoomJoinUrl: true,
  zoomStatus: true,
  conflictStatus: true,
  rescheduleReason: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
  attendees: {
    select: {
      id: true,
      side: true,
      attendanceStatus: true,
      caseParticipant: {
        select: {
          id: true,
          role: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
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

const findCaseParticipants = (caseId, ids, tx = prisma) =>
  tx.caseParticipant.findMany({
    where: { caseId, id: { in: ids } },
    select: {
      id: true,
      userId: true,
      role: true,
      accessStatus: true,
      caseParty: { select: { side: true } },
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

module.exports = {
  findHearingById,
  getHearings,
  createHearing,
  updateHearing,
  findCaseParticipants,
  findConflictingHearings,
};
