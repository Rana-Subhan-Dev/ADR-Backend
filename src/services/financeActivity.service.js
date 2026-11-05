const prisma = require("../config/prisma");

const ACTION_LABELS = {
  TIMESHEET_APPROVED: "Timesheet Approved",
  TIMESHEET_REJECTED: "Timesheet Rejected",
  INVOICE_FINALIZED: "Invoice Finalized",
  INVOICE_SENT: "Invoice Sent",
  INVOICE_VOIDED: "Invoice Voided",
  INVOICE_REISSUED: "Invoice Reissued",
  PAYMENT_RECORDED: "Payment Recorded",
  CREDIT_NOTE_ISSUED: "Credit Note Issued",
  QUICKBOOKS_SYNC: "QuickBooks Sync",
  BILLING_CONFIGURATION_UPDATED: "Billing Configuration Updated",
  PAYMENT_REMINDER_SENT: "Payment Reminder Sent",
};

const VALUE_TONES = {
  DRAFT: "gray",
  SUBMITTED: "blue",
  PENDING: "blue",
  APPROVED: "green",
  REJECTED: "red",
  FINALIZED: "green",
  ISSUED: "green",
  SENT: "green",
  VOIDED: "red",
  UNPAID: "orange",
  PARTIAL: "orange",
  PAID: "green",
  OVERDUE: "red",
  SUCCESS: "green",
  SYNCED: "green",
  FAILED: "red",
  RETRYING: "orange",
  NOT_SYNCED: "gray",
  UNKNOWN: "gray",
  SPLIT_EVENLY: "gray",
  CUSTOM_SPLIT: "blue",
};

const titleCase = (value) =>
  String(value || "")
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const actionLabelFor = (action) =>
  ACTION_LABELS[action] || titleCase(action) || String(action || "");

const valueObject = (input) => {
  if (input == null || input === "") return null;
  if (typeof input === "object" && !Array.isArray(input)) {
    const code = input.code || input.value || null;
    const label =
      input.label ||
      (code ? ACTION_LABELS[code] || titleCase(code) : null) ||
      null;
    if (!code && !label) return null;
    return {
      code: code || null,
      label: label || String(code),
      tone: input.tone || (code ? VALUE_TONES[code] || "gray" : "gray"),
    };
  }
  const code = String(input);
  return {
    code,
    label: ACTION_LABELS[code] || titleCase(code) || code,
    tone: VALUE_TONES[code] || "gray",
  };
};

const shortRef = (prefix, id) =>
  id ? `${prefix}-${String(id).slice(0, 8).toUpperCase()}` : null;

const userDisplayName = (user) => {
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || null;
};

/**
 * Append-only finance activity row. Never throws to callers — mutations must
 * succeed even if activity logging fails.
 */
const appendFinanceActivity = async (payload = {}, client = prisma) => {
  try {
    const actingUser = payload.actingUser || null;
    const actingUserId =
      payload.actingUserId !== undefined
        ? payload.actingUserId
        : actingUser?.id || null;
    const isSystem = Boolean(payload.isSystem) || !actingUserId;

    const row = await client.financeActivityLog.create({
      data: {
        occurredAt: payload.occurredAt
          ? new Date(payload.occurredAt)
          : new Date(),
        action: String(payload.action),
        actingUserId,
        isSystem,
        caseId: payload.caseId || null,
        caseNumber: payload.caseNumber || null,
        matterName: payload.matterName || null,
        invoiceId: payload.invoiceId || null,
        invoiceNumber: payload.invoiceNumber || null,
        timesheetId: payload.timesheetId || null,
        timesheetNumber:
          payload.timesheetNumber || shortRef("TS", payload.timesheetId),
        paymentId: payload.paymentId || null,
        paymentNumber:
          payload.paymentNumber || shortRef("PAY", payload.paymentId),
        previousValue: valueObject(payload.previousValue),
        newValue: valueObject(payload.newValue),
        reason: payload.reason || null,
      },
    });
    return row;
  } catch (error) {
    console.error("[financeActivity] append failed:", error?.message || error);
    return null;
  }
};

const mapFinanceActivityItem = (row) => {
  const actingUserName = row.isSystem
    ? "System"
    : userDisplayName(row.actingUser) || "System";

  return {
    id: row.id,
    occurredAt: row.occurredAt,
    actingUserId: row.isSystem ? null : row.actingUserId,
    actingUserName,
    isSystem: Boolean(row.isSystem),
    action: row.action,
    actionLabel: actionLabelFor(row.action),
    caseId: row.caseId || null,
    caseNumber: row.caseNumber || null,
    matterName: row.matterName || null,
    invoiceId: row.invoiceId || null,
    invoiceNumber: row.invoiceNumber || null,
    timesheetId: row.timesheetId || null,
    timesheetNumber: row.timesheetNumber || null,
    paymentId: row.paymentId || null,
    paymentNumber: row.paymentNumber || null,
    previousValue: row.previousValue || null,
    newValue: row.newValue || null,
    reason: row.reason || null,
  };
};

const FINANCE_ACTIVITY_ACTIONS = Object.keys(ACTION_LABELS).map((value) => ({
  value,
  label: ACTION_LABELS[value],
}));

module.exports = {
  ACTION_LABELS,
  FINANCE_ACTIVITY_ACTIONS,
  actionLabelFor,
  valueObject,
  shortRef,
  appendFinanceActivity,
  mapFinanceActivityItem,
  userDisplayName,
};
