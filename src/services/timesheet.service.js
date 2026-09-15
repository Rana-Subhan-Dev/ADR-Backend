const prisma = require("../config/prisma");
const timesheetRepository = require("../repositories/timesheet.repository");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");
const { BillingExpensesPolicy } = require("@prisma/client");

const managerRoles = ["SUPER_ADMIN", "ADMIN_LEADERSHIP", "CASE_MANAGER"];
const isManager = (user) => managerRoles.includes(user.role?.name);
const canReviewTimesheets = (user) =>
  ["SUPER_ADMIN", "ACCOUNTING_STAFF"].includes(user.role?.name);
const canAccessFinance = (user) => isManager(user) || canReviewTimesheets(user);

const ALLOWED_RECEIPT_EXTENSIONS = new Set([
  "pdf",
  "jpg",
  "jpeg",
  "png",
]);

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

const sumExpenses = (expenses = []) =>
  expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);

const decorateTimesheet = (timesheet) => {
  if (!timesheet) return timesheet;
  const expenses = timesheet.expenses || [];
  return {
    ...timesheet,
    expensesTotal: sumExpenses(expenses),
    expenseCount: expenses.length,
  };
};

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

const getExpensesPolicy = async (caseId, tx = prisma) => {
  const config = await tx.billingConfiguration.findUnique({
    where: { caseId },
    select: { expensesPolicy: true },
  });
  return config?.expensesPolicy || BillingExpensesPolicy.NOT_ALLOWED;
};

const assertExpensesAllowed = async (caseId, expenses, tx = prisma) => {
  if (!expenses || expenses.length === 0) return;
  const policy = await getExpensesPolicy(caseId, tx);
  if (
    policy === BillingExpensesPolicy.NOT_ALLOWED ||
    policy == null
  ) {
    throw new ApiError(
      400,
      "Expenses are not allowed for this case billing configuration.",
    );
  }
};

const assertReceiptDocuments = async (
  caseId,
  documentIds,
  tx = prisma,
) => {
  const ids = [...new Set((documentIds || []).filter(Boolean))];
  if (ids.length === 0) return;

  const documents = await tx.document.findMany({
    where: {
      id: { in: ids },
      caseId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      currentVersion: { select: { mimeType: true } },
    },
  });

  if (documents.length !== ids.length) {
    throw new ApiError(
      400,
      "One or more receipt documents are invalid or do not belong to this case.",
    );
  }

  for (const doc of documents) {
    const fileName = doc.name || "";
    const ext = fileName.includes(".")
      ? fileName.split(".").pop().toLowerCase()
      : "";
    const mime = (doc.currentVersion?.mimeType || "").toLowerCase();
    const okExt = ALLOWED_RECEIPT_EXTENSIONS.has(ext);
    const okMime =
      mime.startsWith("image/jpeg") ||
      mime.startsWith("image/png") ||
      mime === "application/pdf" ||
      mime === "image/jpg";
    if (!okExt && !okMime) {
      throw new ApiError(
        400,
        `Receipt "${doc.name}" must be PDF, JPG, or PNG.`,
      );
    }
  }
};

const createExpenseWithReceipts = async (timesheetId, expense, tx) => {
  const created = await timesheetRepository.createExpense(
    {
      timesheetId,
      expenseType: expense.expenseType,
      expenseDate: new Date(expense.expenseDate),
      amount: expense.amount,
      description: expense.description || null,
    },
    tx,
  );

  const receiptIds = expense.receiptDocumentIds || [];
  for (const documentId of receiptIds) {
    await timesheetRepository.createExpenseReceipt(
      { expenseId: created.id, documentId },
      tx,
    );
  }

  return timesheetRepository.findExpenseById(created.id, tx);
};

const replaceExpenses = async (timesheetId, caseId, expenses, tx) => {
  await assertExpensesAllowed(caseId, expenses, tx);
  const allReceiptIds = (expenses || []).flatMap(
    (row) => row.receiptDocumentIds || [],
  );
  await assertReceiptDocuments(caseId, allReceiptIds, tx);
  await timesheetRepository.deleteExpensesForTimesheet(timesheetId, tx);
  for (const expense of expenses || []) {
    await createExpenseWithReceipts(timesheetId, expense, tx);
  }
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
  return decorateTimesheet(timesheet);
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

const writeReviewHistory = (tx, timesheetId, action, actorUserId, comment) =>
  timesheetRepository.createReviewHistory(
    {
      timesheetId,
      action,
      actorUserId,
      comment: comment || null,
    },
    tx,
  );

const assertDraftEditable = (timesheet, currentUser) => {
  if (timesheet.status !== "DRAFT")
    throw new ApiError(400, "Only draft timesheet entries can be updated.");
  if (!isManager(currentUser) && timesheet.neutralUserId !== currentUser.id)
    throw new ApiError(
      403,
      "You do not have permission to update this timesheet entry.",
    );
};

const createTimesheet = async (caseId, data, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const neutralUserId =
    canAccessFinance(currentUser) && data.neutralUserId
      ? data.neutralUserId
      : currentUser.id;
  await assertNeutral(caseId, neutralUserId);
  await assertHearing(caseId, data.hearingId);
  await assertExpensesAllowed(caseId, data.expenses);

  return prisma.$transaction(async (tx) => {
    const timesheet = await timesheetRepository.create(
      {
        caseId,
        hearingId: data.hearingId || null,
        neutralUserId,
        activityType: data.activityType,
        hours: data.hours,
        entryDate: new Date(data.entryDate),
        billingNotes: data.billingNotes || null,
      },
      tx,
    );

    if (data.expenses?.length) {
      await replaceExpenses(timesheet.id, caseId, data.expenses, tx);
    }

    await writeAudit(tx, currentUser, "CREATE", timesheet, null, {
      neutralUserId,
      activityType: timesheet.activityType,
      hours: timesheet.hours.toString(),
      entryDate: timesheet.entryDate,
      billingNotes: timesheet.billingNotes,
      expenseCount: data.expenses?.length || 0,
    });

    return decorateTimesheet(await timesheetRepository.findById(timesheet.id, tx));
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
  return paginate(
    timesheets.map(decorateTimesheet),
    total,
    page,
    limit,
  );
};

const updateTimesheet = async (caseId, timesheetId, data, currentUser) => {
  const timesheet = await getTimesheet(caseId, timesheetId, currentUser);
  assertDraftEditable(timesheet, currentUser);
  await assertHearing(caseId, data.hearingId);
  if (data.expenses) await assertExpensesAllowed(caseId, data.expenses);

  return prisma.$transaction(async (tx) => {
    const updated = await timesheetRepository.update(
      timesheetId,
      {
        ...(data.hearingId !== undefined && { hearingId: data.hearingId }),
        ...(data.activityType !== undefined && {
          activityType: data.activityType,
        }),
        ...(data.hours !== undefined && { hours: data.hours }),
        ...(data.entryDate && { entryDate: new Date(data.entryDate) }),
        ...(data.billingNotes !== undefined && {
          billingNotes: data.billingNotes || null,
        }),
      },
      tx,
    );

    if (data.expenses) {
      await replaceExpenses(timesheetId, caseId, data.expenses, tx);
    }

    await writeAudit(
      tx,
      currentUser,
      "EDIT",
      updated,
      {
        hearingId: timesheet.hearingId,
        activityType: timesheet.activityType,
        hours: String(timesheet.hours),
        entryDate: timesheet.entryDate,
        billingNotes: timesheet.billingNotes,
      },
      {
        hearingId: updated.hearingId,
        activityType: updated.activityType,
        hours: updated.hours.toString(),
        entryDate: updated.entryDate,
        billingNotes: updated.billingNotes,
      },
    );

    return decorateTimesheet(await timesheetRepository.findById(timesheetId, tx));
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
    return decorateTimesheet(deleted);
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

  if (timesheet.expenses?.length) {
    await assertExpensesAllowed(caseId, timesheet.expenses);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await timesheetRepository.update(
      timesheetId,
      {
        status: "SUBMITTED",
        approvalStatus: "PENDING",
        rejectionComment: null,
        rejectedByUserId: null,
        submittedAt: new Date(),
        reviewedAt: null,
      },
      tx,
    );
    await writeReviewHistory(tx, timesheetId, "SUBMITTED", currentUser.id, null);
    await writeTimeline(
      tx,
      updated,
      currentUser,
      "Timesheet entry submitted.",
      { status: timesheet.status, approvalStatus: timesheet.approvalStatus },
      { status: updated.status, approvalStatus: updated.approvalStatus },
    );
    await writeAudit(
      tx,
      currentUser,
      "EDIT",
      updated,
      { status: timesheet.status },
      { status: updated.status },
    );
    return decorateTimesheet(await timesheetRepository.findById(timesheetId, tx));
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
        reviewedAt: new Date(),
        ...(approved
          ? {
              approvedByUserId: currentUser.id,
              rejectedByUserId: null,
              rejectionComment: null,
            }
          : {
              approvedByUserId: null,
              rejectedByUserId: currentUser.id,
              rejectionComment: data.rejectionComment,
              status: "DRAFT",
            }),
      },
      tx,
    );
    await writeReviewHistory(
      tx,
      timesheetId,
      approved ? "APPROVED" : "REJECTED",
      currentUser.id,
      approved ? null : data.rejectionComment,
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
    return decorateTimesheet(await timesheetRepository.findById(timesheetId, tx));
  });
};

const addExpense = async (caseId, timesheetId, data, currentUser) => {
  const timesheet = await getTimesheet(caseId, timesheetId, currentUser);
  assertDraftEditable(timesheet, currentUser);
  await assertExpensesAllowed(caseId, [data]);
  await assertReceiptDocuments(caseId, data.receiptDocumentIds);

  return prisma.$transaction(async (tx) => {
    const expense = await createExpenseWithReceipts(timesheetId, data, tx);
    await writeAudit(tx, currentUser, "EDIT", timesheet, null, {
      addedExpenseId: expense.id,
      amount: String(expense.amount),
    });
    return expense;
  });
};

const updateExpense = async (
  caseId,
  timesheetId,
  expenseId,
  data,
  currentUser,
) => {
  const timesheet = await getTimesheet(caseId, timesheetId, currentUser);
  assertDraftEditable(timesheet, currentUser);
  const existing = await timesheetRepository.findExpenseById(expenseId);
  if (!existing || existing.timesheetId !== timesheetId)
    throw new ApiError(404, "Expense not found.");

  await assertExpensesAllowed(caseId, [existing]);
  if (data.receiptDocumentIds) {
    await assertReceiptDocuments(caseId, data.receiptDocumentIds);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await timesheetRepository.updateExpense(
      expenseId,
      {
        ...(data.expenseType && { expenseType: data.expenseType }),
        ...(data.expenseDate && { expenseDate: new Date(data.expenseDate) }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.description !== undefined && {
          description: data.description || null,
        }),
      },
      tx,
    );

    if (data.receiptDocumentIds) {
      await tx.timesheetExpenseReceipt.deleteMany({ where: { expenseId } });
      for (const documentId of data.receiptDocumentIds) {
        await timesheetRepository.createExpenseReceipt(
          { expenseId, documentId },
          tx,
        );
      }
    }

    await writeAudit(tx, currentUser, "EDIT", timesheet, { expenseId }, {
      expenseId,
      amount: String(updated.amount),
    });
    return timesheetRepository.findExpenseById(expenseId, tx);
  });
};

const deleteExpense = async (caseId, timesheetId, expenseId, currentUser) => {
  const timesheet = await getTimesheet(caseId, timesheetId, currentUser);
  assertDraftEditable(timesheet, currentUser);
  const existing = await timesheetRepository.findExpenseById(expenseId);
  if (!existing || existing.timesheetId !== timesheetId)
    throw new ApiError(404, "Expense not found.");

  return prisma.$transaction(async (tx) => {
    const deleted = await timesheetRepository.removeExpense(expenseId, tx);
    await writeAudit(tx, currentUser, "EDIT", timesheet, { expenseId }, null);
    return deleted;
  });
};

const attachExpenseReceipt = async (
  caseId,
  timesheetId,
  expenseId,
  documentId,
  currentUser,
) => {
  const timesheet = await getTimesheet(caseId, timesheetId, currentUser);
  assertDraftEditable(timesheet, currentUser);
  const existing = await timesheetRepository.findExpenseById(expenseId);
  if (!existing || existing.timesheetId !== timesheetId)
    throw new ApiError(404, "Expense not found.");
  await assertExpensesAllowed(caseId, [existing]);
  await assertReceiptDocuments(caseId, [documentId]);

  try {
    return await timesheetRepository.createExpenseReceipt({
      expenseId,
      documentId,
    });
  } catch (error) {
    if (error.code === "P2002") {
      throw new ApiError(400, "Receipt is already attached to this expense.");
    }
    throw error;
  }
};

const removeExpenseReceipt = async (
  caseId,
  timesheetId,
  expenseId,
  documentId,
  currentUser,
) => {
  const timesheet = await getTimesheet(caseId, timesheetId, currentUser);
  assertDraftEditable(timesheet, currentUser);
  const existing = await timesheetRepository.findExpenseById(expenseId);
  if (!existing || existing.timesheetId !== timesheetId)
    throw new ApiError(404, "Expense not found.");

  const linked = existing.receipts?.some((r) => r.documentId === documentId);
  if (!linked) throw new ApiError(404, "Receipt not found on this expense.");

  await timesheetRepository.removeExpenseReceipt(expenseId, documentId);
  return { expenseId, documentId, removed: true };
};

module.exports = {
  createTimesheet,
  getTimesheets,
  getTimesheet,
  updateTimesheet,
  deleteTimesheet,
  submitTimesheet,
  reviewTimesheet,
  addExpense,
  updateExpense,
  deleteExpense,
  attachExpenseReceipt,
  removeExpenseReceipt,
  getExpensesPolicy,
  sumExpenses,
};
