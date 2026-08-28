const prisma = require("../config/prisma");
const timesheetRepository = require("../repositories/timesheet.repository");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");

const managerRoles = ["SUPER_ADMIN", "ADMIN_LEADERSHIP", "CASE_MANAGER"];
const isManager = (user) => managerRoles.includes(user.role?.name);
const canReviewTimesheets = (user) =>
  ["SUPER_ADMIN", "ACCOUNTING_STAFF"].includes(user.role?.name);
const canAccessFinance = (user) => isManager(user) || canReviewTimesheets(user);

const paginate = (timesheets, total, page, limit) => ({
  timesheets,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1,
  },
});

const assertNeutral = async (caseId, userId, tx = prisma) => {
  const participant = await tx.caseParticipant.findFirst({
    where: { caseId, userId, role: "NEUTRAL", accessStatus: "ACTIVE" },
    select: { id: true },
  });
  if (!participant)
    throw new ApiError(400, "Neutral must be an active case participant.");
};

const assertHearing = async (caseId, hearingId, tx = prisma) => {
  if (!hearingId) return;
  const hearing = await tx.hearing.findFirst({
    where: { id: hearingId, caseId },
    select: { id: true },
  });
  if (!hearing)
    throw new ApiError(400, "Hearing does not belong to this case.");
};

const getTimesheet = async (caseId, timesheetId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const timesheet = await timesheetRepository.findById(timesheetId);
  if (!timesheet || timesheet.caseId !== caseId)
    throw new ApiError(404, "Timesheet entry not found.");
  if (
    !canAccessFinance(currentUser) &&
    timesheet.neutralUserId !== currentUser.id
  )
    throw new ApiError(403, "You do not have access to this timesheet entry.");
  return timesheet;
};

const writeAudit = (
  tx,
  currentUser,
  action,
  timesheet,
  previousValue,
  newValue,
) =>
  tx.auditLog.create({
    data: {
      actingUserId: currentUser.id,
      actingUserRoleSnapshot: currentUser.role?.name || null,
      action,
      module: "TIMESHEETS",
      affectedRecordType: "NeutralTimesheet",
      affectedRecordId: timesheet.id,
      previousValue,
      newValue,
    },
  });

const writeTimeline = (
  tx,
  timesheet,
  currentUser,
  summary,
  previousValue,
  newValue,
) =>
  tx.caseTimelineEvent.create({
    data: {
      caseId: timesheet.caseId,
      eventType: "STATUS_CHANGED",
      relatedRecordType: "NeutralTimesheet",
      relatedRecordId: timesheet.id,
      summary,
      actorUserId: currentUser.id,
      previousValue: JSON.stringify(previousValue),
      newValue: JSON.stringify(newValue),
    },
  });

const createTimesheet = async (caseId, data, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const neutralUserId =
    canAccessFinance(currentUser) && data.neutralUserId
      ? data.neutralUserId
      : currentUser.id;
  await assertNeutral(caseId, neutralUserId);
  await assertHearing(caseId, data.hearingId);
  return prisma.$transaction(async (tx) => {
    const timesheet = await timesheetRepository.create(
      {
        caseId,
        hearingId: data.hearingId || null,
        neutralUserId,
        activityType: data.activityType,
        hours: data.hours,
        entryDate: new Date(data.entryDate),
      },
      tx,
    );
    await writeAudit(tx, currentUser, "CREATE", timesheet, null, {
      neutralUserId,
      activityType: timesheet.activityType,
      hours: timesheet.hours.toString(),
      entryDate: timesheet.entryDate,
    });
    return timesheet;
  });
};

const getTimesheets = async (caseId, query, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  if (!canAccessFinance(currentUser))
    await assertNeutral(caseId, currentUser.id);
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const where = {
    caseId,
    ...(!canAccessFinance(currentUser) && { neutralUserId: currentUser.id }),
    ...(query.neutralUserId &&
      canAccessFinance(currentUser) && { neutralUserId: query.neutralUserId }),
    ...(query.status && { status: query.status }),
    ...(query.approvalStatus && { approvalStatus: query.approvalStatus }),
    ...(query.activityType && { activityType: query.activityType }),
    ...(query.from || query.to
      ? {
          entryDate: {
            ...(query.from && { gte: new Date(query.from) }),
            ...(query.to && { lte: new Date(query.to) }),
          },
        }
      : {}),
  };
  const [timesheets, total] = await timesheetRepository.getMany({
    where,
    skip: (page - 1) * limit,
    take: limit,
  });
  return paginate(timesheets, total, page, limit);
};

const updateTimesheet = async (caseId, timesheetId, data, currentUser) => {
  const timesheet = await getTimesheet(caseId, timesheetId, currentUser);
  if (timesheet.status !== "DRAFT")
    throw new ApiError(400, "Only draft timesheet entries can be updated.");
  if (!isManager(currentUser) && timesheet.neutralUserId !== currentUser.id)
    throw new ApiError(
      403,
      "You do not have permission to update this timesheet entry.",
    );
  await assertHearing(caseId, data.hearingId);
  return prisma.$transaction(async (tx) => {
    const updated = await timesheetRepository.update(
      timesheetId,
      {
        ...data,
        ...(data.entryDate && { entryDate: new Date(data.entryDate) }),
        ...(data.hearingId === null && { hearingId: null }),
      },
      tx,
    );
    await writeAudit(
      tx,
      currentUser,
      "EDIT",
      updated,
      {
        hearingId: timesheet.hearingId,
        activityType: timesheet.activityType,
        hours: timesheet.hours.toString(),
        entryDate: timesheet.entryDate,
      },
      {
        hearingId: updated.hearingId,
        activityType: updated.activityType,
        hours: updated.hours.toString(),
        entryDate: updated.entryDate,
      },
    );
    return updated;
  });
};

const deleteTimesheet = async (caseId, timesheetId, currentUser) => {
  const timesheet = await getTimesheet(caseId, timesheetId, currentUser);
  if (timesheet.status !== "DRAFT")
    throw new ApiError(400, "Only draft timesheet entries can be deleted.");
  return prisma.$transaction(async (tx) => {
    const deleted = await timesheetRepository.remove(timesheetId, tx);
    await writeAudit(
      tx,
      currentUser,
      "DELETE",
      deleted,
      {
        activityType: deleted.activityType,
        hours: deleted.hours.toString(),
        entryDate: deleted.entryDate,
      },
      null,
    );
    return deleted;
  });
};

const submitTimesheet = async (caseId, timesheetId, currentUser) => {
  const timesheet = await getTimesheet(caseId, timesheetId, currentUser);
  if (timesheet.neutralUserId !== currentUser.id)
    throw new ApiError(
      403,
      "Only the assigned neutral can submit this timesheet entry.",
    );
  if (timesheet.status !== "DRAFT")
    throw new ApiError(400, "Only draft timesheet entries can be submitted.");
  return prisma.$transaction(async (tx) => {
    const updated = await timesheetRepository.update(
      timesheetId,
      {
        status: "SUBMITTED",
        approvalStatus: "PENDING",
        rejectionComment: null,
      },
      tx,
    );
    await writeTimeline(
      tx,
      updated,
      currentUser,
      "Timesheet entry submitted.",
      { status: timesheet.status },
      { status: updated.status },
    );
    await writeAudit(
      tx,
      currentUser,
      "EDIT",
      updated,
      { status: timesheet.status },
      { status: updated.status },
    );
    return updated;
  });
};

const reviewTimesheet = async (caseId, timesheetId, data, currentUser) => {
  const timesheet = await getTimesheet(caseId, timesheetId, currentUser);
  if (!canReviewTimesheets(currentUser))
    throw new ApiError(
      403,
      "You do not have permission to review timesheet entries.",
    );
  if (
    timesheet.status !== "SUBMITTED" ||
    timesheet.approvalStatus !== "PENDING"
  )
    throw new ApiError(
      400,
      "Only submitted pending timesheet entries can be reviewed.",
    );
  const approved = data.approvalStatus === "APPROVED";
  return prisma.$transaction(async (tx) => {
    const updated = await timesheetRepository.update(
      timesheetId,
      {
        approvalStatus: data.approvalStatus,
        approvedByUserId: approved ? currentUser.id : null,
        rejectionComment: approved ? null : data.rejectionComment,
        ...(!approved && { status: "DRAFT" }),
      },
      tx,
    );
    const label = approved ? "approved" : "rejected";
    await writeTimeline(
      tx,
      updated,
      currentUser,
      `Timesheet entry ${label}.`,
      { status: timesheet.status, approvalStatus: timesheet.approvalStatus },
      { status: updated.status, approvalStatus: updated.approvalStatus },
    );
    await writeAudit(
      tx,
      currentUser,
      "APPROVE",
      updated,
      { status: timesheet.status, approvalStatus: timesheet.approvalStatus },
      { status: updated.status, approvalStatus: updated.approvalStatus },
    );
    return updated;
  });
};

module.exports = {
  createTimesheet,
  getTimesheets,
  getTimesheet,
  updateTimesheet,
  deleteTimesheet,
  submitTimesheet,
  reviewTimesheet,
};
