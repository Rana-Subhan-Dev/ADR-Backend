const {
  InvoiceStatus,
  InvoiceReviewStatus,
  PaymentStatus,
  InvoiceAudience,
  TimesheetStatus,
  TimesheetApprovalStatus,
} = require("@prisma/client");
const prisma = require("../config/prisma");
const ApiError = require("../utils/apiError");
const billingService = require("./billing.service");
const caseNoteRepository = require("../repositories/caseNote.repository");
const notificationService = require("./notification.service");

const {
  computeInvoiceBalances,
  isBillingConfigComplete,
  roundMoney,
  partyDisplayName,
  userDisplayName,
} = billingService;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const RELATED_INVOICE_PREVIEW_LIMIT = 10;

const FINALIZED_INVOICE_STATUSES = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.SENT,
  InvoiceStatus.OVERDUE,
];

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  company: true,
};

const caseFinancialInclude = {
  inquiry: { select: { matterName: true } },
  disputeCategory: { select: { id: true, name: true } },
  participants: {
    where: {
      accessStatus: "ACTIVE",
      role: { in: ["CASE_MANAGER", "NEUTRAL"] },
    },
    select: {
      id: true,
      role: true,
      isPrimary: true,
      userId: true,
      user: { select: userSelect },
    },
  },
  billingConfiguration: {
    include: {
      payerSplits: {
        include: {
          caseParty: {
            select: {
              id: true,
              side: true,
              partyType: true,
              firstName: true,
              lastName: true,
              organizationName: true,
              email: true,
              phone: true,
              streetAddress: true,
              city: true,
              state: true,
              postalCode: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  },
  invoices: {
    include: {
      payments: { select: { amount: true, paymentDate: true } },
      creditNotes: { select: { amount: true } },
    },
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
  },
  neutralTimesheets: {
    select: {
      id: true,
      status: true,
      approvalStatus: true,
      updatedAt: true,
    },
  },
};

const formatBillingAddress = (party) => {
  if (!party) return null;
  const parts = [
    party.streetAddress,
    [party.city, party.state].filter(Boolean).join(", "),
    party.postalCode,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
};

const maxDate = (...dates) => {
  let best = null;
  for (const value of dates) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) continue;
    if (best === null || time > best) best = time;
  }
  return best === null ? null : new Date(best);
};

const resolveCaseManager = (participants = []) => {
  const managers = participants.filter((p) => p.role === "CASE_MANAGER");
  return managers.find((p) => p.isPrimary) || managers[0] || null;
};

const resolveNeutral = (participants = []) =>
  participants.find((p) => p.role === "NEUTRAL") || null;

const resolveBillingStatus = (config) => {
  if (!isBillingConfigComplete(config)) return "MISSING";
  if (!config.accountingAuditComplete) return "PENDING_REVIEW";
  return "CONFIGURED";
};

const resolveTimesheetStatus = (timesheets = []) => {
  const relevant = timesheets.filter((t) => t.status !== TimesheetStatus.DRAFT);
  if (!relevant.length) return null;
  if (
    relevant.some((t) => t.approvalStatus === TimesheetApprovalStatus.PENDING)
  ) {
    return "PENDING_REVIEW";
  }
  if (
    relevant.some((t) => t.approvalStatus === TimesheetApprovalStatus.REJECTED)
  ) {
    return "REJECTED";
  }
  if (
    relevant.some((t) => t.approvalStatus === TimesheetApprovalStatus.APPROVED)
  ) {
    return "APPROVED";
  }
  return null;
};

const resolveInvoiceStatusRollup = (invoices = []) => {
  if (!invoices.length) return null;

  const drafts = invoices.filter((i) => i.invoiceStatus === InvoiceStatus.DRAFT);
  if (
    drafts.some(
      (i) => i.reviewStatus === InvoiceReviewStatus.PENDING_REVIEW,
    )
  ) {
    return "PENDING_REVIEW";
  }
  if (drafts.length) return "DRAFT";

  const nonVoid = invoices.filter((i) => i.invoiceStatus !== InvoiceStatus.VOID);
  if (!nonVoid.length) return "VOIDED";

  const finalized = nonVoid.filter((i) =>
    FINALIZED_INVOICE_STATUSES.includes(i.invoiceStatus),
  );
  if (
    finalized.some(
      (i) =>
        i.paymentStatus === PaymentStatus.UNPAID ||
        i.paymentStatus === PaymentStatus.PARTIAL,
    )
  ) {
    return "SENT";
  }
  if (
    finalized.length &&
    finalized.every((i) => i.paymentStatus === PaymentStatus.PAID)
  ) {
    return "PAID";
  }
  if (nonVoid.some((i) => i.invoiceStatus === InvoiceStatus.DRAFT)) {
    return "DRAFT";
  }
  return "SENT";
};

const resolvePaymentStatusRollup = (invoices = [], now = new Date()) => {
  const finalized = invoices.filter(
    (i) =>
      i.invoiceStatus !== InvoiceStatus.VOID &&
      i.invoiceStatus !== InvoiceStatus.DRAFT &&
      FINALIZED_INVOICE_STATUSES.includes(i.invoiceStatus),
  );
  if (!finalized.length) return null;

  let hasOverdue = false;
  let hasPartial = false;
  let hasUnpaid = false;
  let allPaid = true;

  for (const invoice of finalized) {
    const balances = computeInvoiceBalances(invoice, now);
    if (balances.overdue) hasOverdue = true;
    if (invoice.paymentStatus === PaymentStatus.PARTIAL) hasPartial = true;
    if (invoice.paymentStatus === PaymentStatus.UNPAID) hasUnpaid = true;
    if (invoice.paymentStatus !== PaymentStatus.PAID) allPaid = false;
  }

  if (hasOverdue) return "OVERDUE";
  if (hasPartial) return "PARTIALLY_PAID";
  if (hasUnpaid) return "UNPAID";
  if (allPaid) return "PAID";
  return null;
};

const sumOutstanding = (invoices = [], now = new Date()) => {
  let total = 0;
  for (const invoice of invoices) {
    if (
      invoice.invoiceStatus === InvoiceStatus.VOID ||
      invoice.invoiceStatus === InvoiceStatus.DRAFT
    ) {
      continue;
    }
    const balances = computeInvoiceBalances(invoice, now);
    total = roundMoney(total + balances.openBalance);
  }
  return total;
};

const mapPaymentOrientedStatus = (invoice) => {
  if (invoice.paymentStatus === PaymentStatus.PAID) return "PAID";
  if (invoice.paymentStatus === PaymentStatus.PARTIAL) return "PARTIALLY_PAID";
  return "UNPAID";
};

const buildLastActivityAt = (caseRecord) => {
  const invoiceDates = (caseRecord.invoices || []).flatMap((inv) => [
    inv.updatedAt,
    inv.invoiceDate,
  ]);
  const timesheetDates = (caseRecord.neutralTimesheets || []).map(
    (t) => t.updatedAt,
  );
  return maxDate(
    caseRecord.updatedAt,
    caseRecord.billingConfiguration?.updatedAt,
    ...invoiceDates,
    ...timesheetDates,
  );
};

const buildCaseFinancialRow = (caseRecord, now = new Date()) => {
  const caseManager = resolveCaseManager(caseRecord.participants);
  const neutral = resolveNeutral(caseRecord.participants);
  const invoices = caseRecord.invoices || [];
  const lastActivityAt = buildLastActivityAt(caseRecord);

  return {
    caseId: caseRecord.id,
    caseNumber: caseRecord.caseNumber,
    matterName: caseRecord.inquiry?.matterName || caseRecord.title,
    caseStatus: caseRecord.lifecycleStatus,
    caseType: caseRecord.caseType,
    caseTypeLabel: caseRecord.caseTypeLabel || null,
    neutralUserId: neutral?.userId || neutral?.user?.id || null,
    neutralName: userDisplayName(neutral?.user),
    caseManagerUserId: caseManager?.userId || caseManager?.user?.id || null,
    caseManagerName: userDisplayName(caseManager?.user),
    billingStatus: resolveBillingStatus(caseRecord.billingConfiguration),
    timesheetStatus: resolveTimesheetStatus(caseRecord.neutralTimesheets),
    invoiceStatus: resolveInvoiceStatusRollup(invoices),
    paymentStatus: resolvePaymentStatusRollup(invoices, now),
    outstandingBalance: sumOutstanding(invoices, now),
    lastActivityAt,
  };
};

const buildFilterOptions = (rows) => {
  const caseManagers = new Map();
  const neutrals = new Map();
  for (const row of rows) {
    if (row.caseManagerUserId && row.caseManagerName) {
      caseManagers.set(row.caseManagerUserId, {
        id: row.caseManagerUserId,
        name: row.caseManagerName,
      });
    }
    if (row.neutralUserId && row.neutralName) {
      neutrals.set(row.neutralUserId, {
        id: row.neutralUserId,
        name: row.neutralName,
      });
    }
  }
  const byName = (a, b) =>
    String(a.name).localeCompare(String(b.name), undefined, {
      sensitivity: "base",
    });
  return {
    caseManagers: [...caseManagers.values()].sort(byName),
    neutrals: [...neutrals.values()].sort(byName),
  };
};

const matchesSearch = (row, search) => {
  if (!search) return true;
  const needle = search.toLocaleLowerCase();
  const haystack = [
    row.matterName,
    row.neutralName,
    row.caseNumber,
    row.caseManagerName,
    row.caseType,
    row.caseTypeLabel,
  ];
  return haystack.some((value) =>
    String(value || "")
      .toLocaleLowerCase()
      .includes(needle),
  );
};

const listCaseFinancials = async (query = {}) => {
  const page = Number(query.page) || DEFAULT_PAGE;
  const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  const now = new Date();

  const cases = await prisma.case.findMany({
    where: { isDraft: false },
    include: caseFinancialInclude,
    orderBy: [{ updatedAt: "desc" }, { caseNumber: "asc" }],
  });

  let rows = cases.map((c) => buildCaseFinancialRow(c, now));
  const filterOptions = buildFilterOptions(rows);

  if (query.search) {
    rows = rows.filter((row) => matchesSearch(row, query.search));
  }
  if (query.dateRange) {
    const days = Number(query.dateRange);
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    rows = rows.filter(
      (row) => row.lastActivityAt && new Date(row.lastActivityAt) >= cutoff,
    );
  }
  if (query.invoiceStatus) {
    rows = rows.filter((row) => row.invoiceStatus === query.invoiceStatus);
  }
  if (query.paymentStatus) {
    rows = rows.filter((row) => row.paymentStatus === query.paymentStatus);
  }
  if (query.billingStatus) {
    rows = rows.filter((row) => row.billingStatus === query.billingStatus);
  }
  if (query.timesheetStatus) {
    rows = rows.filter((row) => row.timesheetStatus === query.timesheetStatus);
  }
  if (query.caseManagerUserId) {
    rows = rows.filter(
      (row) => row.caseManagerUserId === query.caseManagerUserId,
    );
  }
  if (query.neutralUserId) {
    rows = rows.filter((row) => row.neutralUserId === query.neutralUserId);
  }

  rows.sort((left, right) => {
    const leftTime = left.lastActivityAt
      ? new Date(left.lastActivityAt).getTime()
      : 0;
    const rightTime = right.lastActivityAt
      ? new Date(right.lastActivityAt).getTime()
      : 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return String(left.caseNumber || "").localeCompare(
      String(right.caseNumber || ""),
      undefined,
      { numeric: true, sensitivity: "base" },
    );
  });

  const totalItems = rows.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;
  const skip = (page - 1) * limit;
  const items = rows.slice(skip, skip + limit);

  return {
    items,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
    },
    filterOptions,
  };
};

const buildNeutralCaseRate = (config) => {
  if (!config) {
    return {
      neutralCaseRateAmount: null,
      neutralCaseRateUnit: null,
      neutralCaseRateDisplay: null,
    };
  }
  if (config.neutralHourlyRate != null) {
    const amount = Number(config.neutralHourlyRate);
    return {
      neutralCaseRateAmount: amount,
      neutralCaseRateUnit: "HOUR",
      neutralCaseRateDisplay: `$${amount.toFixed(2)} / Hour`,
    };
  }
  if (config.neutralDailyRate != null) {
    const amount = Number(config.neutralDailyRate);
    return {
      neutralCaseRateAmount: amount,
      neutralCaseRateUnit: "DAY",
      neutralCaseRateDisplay: `$${amount.toFixed(2)} / Day`,
    };
  }
  if (config.flatFeeAmount != null) {
    const amount = Number(config.flatFeeAmount);
    return {
      neutralCaseRateAmount: amount,
      neutralCaseRateUnit: "FLAT",
      neutralCaseRateDisplay: `$${amount.toFixed(2)} Flat`,
    };
  }
  if (config.customRate != null) {
    const amount = Number(config.customRate);
    return {
      neutralCaseRateAmount: amount,
      neutralCaseRateUnit: "CUSTOM",
      neutralCaseRateDisplay: config.customRateDescription
        ? `$${amount.toFixed(2)} (${config.customRateDescription})`
        : `$${amount.toFixed(2)} Custom`,
    };
  }
  return {
    neutralCaseRateAmount: null,
    neutralCaseRateUnit: null,
    neutralCaseRateDisplay: null,
  };
};

const percentLabel = (value) => {
  if (value == null) return null;
  return `${Number(value)}%`;
};

const buildFinancialSummary = (invoices = [], now = new Date()) => {
  const clientInvoices = invoices.filter(
    (i) => i.audience === InvoiceAudience.CLIENT,
  );

  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  let draftInvoiceTotal = 0;
  let depositBalance = 0;
  let hasDepositInvoice = false;

  for (const invoice of clientInvoices) {
    const balances = computeInvoiceBalances(invoice, now);
    if (invoice.invoiceStatus === InvoiceStatus.DRAFT) {
      draftInvoiceTotal = roundMoney(draftInvoiceTotal + balances.amountDue);
      continue;
    }
    if (invoice.invoiceStatus === InvoiceStatus.VOID) continue;

    totalInvoiced = roundMoney(totalInvoiced + balances.amountDue);
    totalPaid = roundMoney(totalPaid + balances.amountPaid);
    totalOutstanding = roundMoney(totalOutstanding + balances.openBalance);

    if (invoice.invoiceType === "DEPOSIT") {
      hasDepositInvoice = true;
      depositBalance = roundMoney(depositBalance + balances.amountPaid);
    }
  }

  return {
    totalInvoiced,
    totalPaid,
    totalOutstanding,
    draftInvoiceTotal,
    totalRevenue: totalPaid,
    depositBalance: hasDepositInvoice ? depositBalance : 0,
  };
};

const mapRelatedInvoice = (invoice, now = new Date(), { includeProvider } = {}) => {
  const balances = computeInvoiceBalances(invoice, now);
  const row = {
    id: invoice.id,
    invoiceDate: invoice.invoiceDate,
    invoiceNumber: invoice.invoiceNumber,
    dueDate: invoice.dueDate,
    status: mapPaymentOrientedStatus(invoice),
    amount: balances.amountDue,
    paidAmount: balances.amountPaid,
    outstandingAmount: balances.openBalance,
  };
  if (includeProvider) {
    row.serviceProvider = includeProvider;
  }
  return row;
};

const getCaseFinancials = async (caseId) => {
  const caseRecord = await prisma.case.findFirst({
    where: { id: caseId, isDraft: false },
    include: caseFinancialInclude,
  });

  if (!caseRecord) {
    throw new ApiError(404, "Case not found.");
  }

  const now = new Date();
  const caseManager = resolveCaseManager(caseRecord.participants);
  const neutral = resolveNeutral(caseRecord.participants);
  const config = caseRecord.billingConfiguration;
  const rate = buildNeutralCaseRate(config);

  const payers = (config?.payerSplits || []).map((split) => {
    const party = split.caseParty;
    return {
      id: party?.id || split.casePartyId,
      payerName: partyDisplayName(party),
      role: party?.side || null,
      invoiceContactName: split.invoiceContactName || null,
      email: split.invoiceContactEmail || party?.email || null,
      phone: party?.phone || null,
      billingAddress: formatBillingAddress(party),
    };
  });

  const clientInvoices = (caseRecord.invoices || [])
    .filter((i) => i.audience === InvoiceAudience.CLIENT)
    .slice(0, RELATED_INVOICE_PREVIEW_LIMIT)
    .map((invoice) => mapRelatedInvoice(invoice, now));

  const serviceProvider =
    userDisplayName(neutral?.user) ||
    neutral?.user?.company ||
    null;

  const neutralInvoices = (caseRecord.invoices || [])
    .filter((i) => i.audience === InvoiceAudience.NEUTRAL)
    .slice(0, RELATED_INVOICE_PREVIEW_LIMIT)
    .map((invoice) =>
      mapRelatedInvoice(invoice, now, { includeProvider: serviceProvider }),
    );

  return {
    caseId: caseRecord.id,
    caseNumber: caseRecord.caseNumber,
    caseInformation: {
      matterName: caseRecord.inquiry?.matterName || caseRecord.title,
      caseType: caseRecord.caseTypeLabel || caseRecord.caseType,
      caseStatus: caseRecord.lifecycleStatus,
      caseManagerUserId: caseManager?.userId || caseManager?.user?.id || null,
      caseManagerName: userDisplayName(caseManager?.user),
      neutralUserId: neutral?.userId || neutral?.user?.id || null,
      neutralName: userDisplayName(neutral?.user),
      disputeType: caseRecord.disputeCategory?.name || null,
    },
    financialSummary: buildFinancialSummary(caseRecord.invoices, now),
    payers,
    billingConfiguration: config
      ? {
          billingType: config.billingType,
          splitPercentage: Boolean(config.splitBillingEnabled),
          ...rate,
        }
      : null,
    fedArbFeeSchedule: config
      ? {
          caseType: config.fedArbFeeScheduleType || caseRecord.caseType,
          setupFee:
            config.setupFee != null ? Number(config.setupFee) : null,
          adminFeeClient: percentLabel(config.adminFeePercentage),
          agreementFeeNeutral: percentLabel(config.agreementFeePercentage),
        }
      : null,
    neutralFeeSchedule: config
      ? {
          feeType: config.billingType,
          hourlyRate:
            config.neutralHourlyRate != null
              ? Number(config.neutralHourlyRate)
              : null,
          dailyRate:
            config.neutralDailyRate != null
              ? Number(config.neutralDailyRate)
              : null,
          flatRate:
            config.flatFeeAmount != null
              ? Number(config.flatFeeAmount)
              : null,
          hearingDays:
            config.includedHearingDays != null
              ? config.includedHearingDays
              : null,
        }
      : null,
    relatedClientInvoices: clientInvoices,
    relatedNeutralInvoices: neutralInvoices,
  };
};

const contactCaseManager = async (caseId, body, currentUser) => {
  const caseRecord = await prisma.case.findFirst({
    where: { id: caseId, isDraft: false },
    select: {
      id: true,
      caseNumber: true,
      title: true,
      inquiry: { select: { matterName: true } },
      participants: {
        where: {
          role: "CASE_MANAGER",
          accessStatus: "ACTIVE",
        },
        select: {
          userId: true,
          isPrimary: true,
          user: { select: userSelect },
        },
      },
    },
  });

  if (!caseRecord) {
    throw new ApiError(404, "Case not found.");
  }

  const caseManager =
    caseRecord.participants.find((p) => p.isPrimary) ||
    caseRecord.participants[0] ||
    null;

  if (!caseManager) {
    throw new ApiError(409, "No case manager is assigned to this case.");
  }

  const message = String(body.message || "").trim();
  if (!message) {
    throw new ApiError(400, "message is required.");
  }

  const authorName = userDisplayName(currentUser) || "Accounting Staff";
  const matterName = caseRecord.inquiry?.matterName || caseRecord.title;

  await prisma.$transaction(async (tx) => {
    await caseNoteRepository.createCaseNote(
      {
        caseId,
        authorUserId: currentUser.id,
        noteType: "INTERNAL_NOTE",
        visibility: "INTERNAL_ONLY",
        body: message,
      },
      tx,
    );

    await notificationService.notifyCaseManagers(
      caseId,
      {
        eventType: "CASE_MESSAGE",
        subject: `Accounting message on ${caseRecord.caseNumber}`,
        relatedRecordType: "Case",
        relatedRecordId: caseId,
        templateData: {
          title: "Message from Accounting",
          message: `${authorName}: ${message}`,
          kind: "ACCOUNTING_CONTACT",
          caseNumber: caseRecord.caseNumber,
          matter: matterName,
          href: `/case-manager/cases/${caseId}`,
        },
      },
      { tx },
    );
  });

  return {
    sent: true,
    caseId,
    caseManagerUserId: caseManager.userId,
    caseManagerName: userDisplayName(caseManager.user),
  };
};

module.exports = {
  listCaseFinancials,
  getCaseFinancials,
  contactCaseManager,
};
