const {
  TimesheetActivityType,
  TimesheetExpenseType,
  TimesheetStatus,
  TimesheetApprovalStatus,
} = require("@prisma/client");

const ACTIVITY_TYPE_LABELS = {
  [TimesheetActivityType.PRE_HEARING_PREPARATION]: "Pre-Hearing Preparation",
  [TimesheetActivityType.REVIEW_OF_DOCUMENTS]: "Document Review",
  [TimesheetActivityType.HEARING_TIME]: "Hearing",
  [TimesheetActivityType.POST_HEARING_FOLLOW_UP]: "Post-Hearing Follow-Up",
  [TimesheetActivityType.CASE_MANAGEMENT]: "Case Administration",
};

const EXPENSE_TYPE_LABELS = {
  [TimesheetExpenseType.TRAVEL]: "Travel Expense",
  [TimesheetExpenseType.HOTEL]: "Hotel",
  [TimesheetExpenseType.MEALS]: "Meals",
  [TimesheetExpenseType.OTHER]: "Other",
};

const userDisplayName = (user) => {
  if (!user) return null;
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.email ||
    null
  );
};

const activityTypeLabel = (activityType) => {
  if (!activityType) return null;
  return (
    ACTIVITY_TYPE_LABELS[activityType] ||
    String(activityType)
      .split("_")
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(" ")
  );
};

const expenseTypeLabel = (expenseType) => {
  if (!expenseType) return null;
  return (
    EXPENSE_TYPE_LABELS[expenseType] ||
    String(expenseType)
      .split("_")
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(" ")
  );
};

/**
 * Accounting / FE display status.
 * Reject returns status to DRAFT while approvalStatus stays REJECTED.
 */
const resolveDisplayStatus = (timesheet) => {
  if (!timesheet) return null;
  if (timesheet.approvalStatus === TimesheetApprovalStatus.APPROVED) {
    return "APPROVED";
  }
  if (timesheet.approvalStatus === TimesheetApprovalStatus.REJECTED) {
    return "REJECTED";
  }
  if (
    timesheet.status === TimesheetStatus.SUBMITTED &&
    timesheet.approvalStatus === TimesheetApprovalStatus.PENDING
  ) {
    return "SUBMITTED";
  }
  return "DRAFT";
};

const resolveReviewedBy = (timesheet) => {
  if (!timesheet) {
    return { reviewedByUserId: null, reviewedByName: null };
  }
  if (timesheet.approvalStatus === TimesheetApprovalStatus.APPROVED) {
    return {
      reviewedByUserId: timesheet.approvedByUserId || timesheet.approvedBy?.id || null,
      reviewedByName: userDisplayName(timesheet.approvedBy),
    };
  }
  if (timesheet.approvalStatus === TimesheetApprovalStatus.REJECTED) {
    return {
      reviewedByUserId: timesheet.rejectedByUserId || timesheet.rejectedBy?.id || null,
      reviewedByName: userDisplayName(timesheet.rejectedBy),
    };
  }
  return { reviewedByUserId: null, reviewedByName: null };
};

const mapReviewHistory = (history = []) => {
  let sawRejected = false;
  return history.map((row) => {
    const action = row.action;
    let eventType = action;
    let statusLabel = null;
    let actorLabel = null;

    if (action === "SUBMITTED") {
      if (sawRejected) {
        eventType = "RESUBMITTED";
        statusLabel = "Resubmitted";
      } else {
        statusLabel = "Submitted";
      }
      actorLabel = "Submitted By";
    } else if (action === "APPROVED") {
      statusLabel = "Approved";
      actorLabel = "Approved By";
    } else if (action === "REJECTED") {
      sawRejected = true;
      statusLabel = "Returned for Correction";
      actorLabel = "Rejected By";
    } else {
      statusLabel = String(action || "")
        .split("_")
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join(" ");
      actorLabel = "Updated By";
    }

    return {
      id: row.id,
      eventType,
      statusLabel,
      actorLabel,
      actorName: userDisplayName(row.actor),
      actorUserId: row.actorUserId || row.actor?.id || null,
      occurredAt: row.createdAt,
      comment: row.comment || null,
    };
  });
};

const mapExpense = (expense) => {
  if (!expense) return expense;
  return {
    ...expense,
    amount: expense.amount != null ? Number(expense.amount) : null,
    expenseTypeLabel: expenseTypeLabel(expense.expenseType),
  };
};

const sumExpenses = (expenses = []) =>
  expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);

/**
 * Additive shaping for detail/list consumers (Neutral + Accounting).
 * Keeps raw status / approvalStatus; adds displayStatus and convenience fields.
 */
const decorateTimesheetDisplay = (timesheet) => {
  if (!timesheet) return timesheet;

  const expenses = (timesheet.expenses || []).map(mapExpense);
  const reviewed = resolveReviewedBy(timesheet);
  const caseRecord = timesheet.case || null;
  const matterName =
    caseRecord?.inquiry?.matterName || caseRecord?.title || null;

  return {
    ...timesheet,
    hours: timesheet.hours != null ? Number(timesheet.hours) : null,
    expenses,
    expensesTotal: sumExpenses(expenses),
    expenseCount: expenses.length,
    matterName,
    caseNumber: caseRecord?.caseNumber || null,
    caseType: caseRecord?.caseType || null,
    caseTypeLabel: caseRecord?.caseTypeLabel || null,
    neutralName: userDisplayName(timesheet.neutral),
    hearingReference: timesheet.hearing?.hearingReference || null,
    activityTypeLabel: activityTypeLabel(timesheet.activityType),
    displayStatus: resolveDisplayStatus(timesheet),
    // FE convenience alias used by Accounting portal
    statusDisplay: resolveDisplayStatus(timesheet),
    reviewedByUserId: reviewed.reviewedByUserId,
    reviewedByName: reviewed.reviewedByName,
    reviewHistory: mapReviewHistory(timesheet.reviewHistory || []),
  };
};

const activityTypeOptions = () =>
  Object.values(TimesheetActivityType).map((value) => ({
    value,
    label: activityTypeLabel(value),
  }));

module.exports = {
  ACTIVITY_TYPE_LABELS,
  EXPENSE_TYPE_LABELS,
  userDisplayName,
  activityTypeLabel,
  expenseTypeLabel,
  resolveDisplayStatus,
  resolveReviewedBy,
  mapReviewHistory,
  mapExpense,
  sumExpenses,
  decorateTimesheetDisplay,
  activityTypeOptions,
};
