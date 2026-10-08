const prisma = require("../config/prisma");
const { runTransaction } = require("../config/prisma");
const billingRepository = require("../repositories/billing.repository");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");
const { sendEmail } = require("../utils/sendEmail");
const { getObjectBuffer } = require("../utils/s3Helper");
const { PRE_POST_ACTIVITY_TYPES } = require("../constants/billing.constants");
const {
  InvoiceStatus,
  InvoiceReviewStatus,
  PaymentStatus,
  TimesheetApprovalStatus,
  IntegrationType,
  CaseTimelineEventType,
  BillingType,
  BillingInputSource,
  BillingMode,
  BillingExpensesPolicy,
  TravelTimeRateType,
  PermissionModule,
  PermissionAction,
} = require("@prisma/client");
const {
  normalizeBillingConfigPayload,
  normalizeBillingTypeInput,
  normalizeBillingModeInput,
  normalizeBillingInputSourceInput,
} = require("../utils/cmPayloadNormalize");

const allowedBillingRoles = [
  "SUPER_ADMIN",
  "ADMIN_LEADERSHIP",
  "ACCOUNTING_STAFF",
  "CASE_MANAGER",
  "NEUTRAL",
  "LAWYER",
  "CLIENT",
];

const BILLING_CONFIG_SCALAR_KEYS = [
  "billingType",
  "billingInputSource",
  "billingMode",
  "neutralHourlyRate",
  "neutralDailyRate",
  "caseManagementHourlyRate",
  "flatFeeAmount",
  "includedHearingDays",
  "includedPrePostHearingHours",
  "overageHourlyRate",
  "additionalDayRate",
  "customRate",
  "customRateDescription",
  "expensesPolicy",
  "travelTimeRateType",
  "travelTimeCustomHourlyRate",
  "splitBillingEnabled",
  "roundingResidualCasePartyId",
  "taxApplicability",
  "deliveryContactEmail",
  "billingNotes",
  "accountingAuditComplete",
  "fedArbFeeScheduleType",
  "setupFee",
  "administrationFee",
  "adminFeePercentage",
  "agreementFeePercentage",
  "hasTrustAccount",
];

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

const endOfUtcDay = (value) => {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
};

const runInvoiceGenerationTransaction = async (fn, options) => {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await runTransaction(fn, options);
    } catch (error) {
      lastError = error;
      const target = String(error?.meta?.target || "");
      const retryable =
        error?.code === "P2034" ||
        (error?.code === "P2002" && target.includes("invoiceNumber"));
      if (!retryable || attempt === 3) throw error;
    }
  }
  throw lastError;
};

const emptyToNull = (value) =>
  value === undefined || value === "" ? null : value;

const isAuthorizedForBilling = (user) =>
  allowedBillingRoles.includes(user?.role?.name);

const buildBillingCaseScope = (currentUser) => {
  const roleName = currentUser?.role?.name;
  if (
    ["SUPER_ADMIN", "ADMIN_LEADERSHIP", "ACCOUNTING_STAFF"].includes(roleName)
  ) {
    return {};
  }
  return {
    participants: {
      some: {
        userId: currentUser.id,
        role: roleName,
        accessStatus: "ACTIVE",
      },
    },
  };
};

const assertCanMutateCaseBilling = async (caseId, currentUser) => {
  const roleName = currentUser?.role?.name;
  if (["SUPER_ADMIN", "ACCOUNTING_STAFF"].includes(roleName)) {
    return;
  }
  if (roleName === "CASE_MANAGER") {
    if (!caseId) {
      throw new ApiError(400, "Case ID is required.");
    }
    const participant =
      await billingRepository.findActiveBillingCaseParticipant(
        caseId,
        currentUser.id,
        "CASE_MANAGER",
      );
    if (!participant) {
      throw new ApiError(
        403,
        "You do not have permission to manage billing for this case.",
      );
    }
    return;
  }
  throw new ApiError(
    403,
    "You do not have permission to perform this billing action.",
  );
};

const applyBillingCaseFilter = (where, currentUser, relationKey = "case") => {
  const scope = buildBillingCaseScope(currentUser);
  if (Object.keys(scope).length === 0) {
    return where;
  }

  if (relationKey) {
    return {
      ...where,
      [relationKey]: { ...(where[relationKey] || {}), ...scope },
    };
  }

  return { ...where, ...scope };
};

const assertCaseAccessIfProvided = async (caseId, currentUser) => {
  if (caseId) {
    await caseService.getCaseById(caseId, currentUser);
  }
};

const paginate = (items, total, page, limit, key) => ({
  [key]: items,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1,
  },
});

const generateInvoiceNumber = async (tx = prisma) => {
  const numbers = await generateInvoiceNumbers(tx, 1);
  return numbers[0];
};

const generateInvoiceNumbers = async (tx = prisma, count = 1) => {
  const currentYear = new Date().getFullYear();
  const prefix = `INV-${currentYear}-`;
  const lastInvoice = await tx.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  let sequence = 1;
  if (lastInvoice) {
    const lastNum = parseInt(lastInvoice.invoiceNumber.replace(prefix, ""), 10);
    if (!Number.isNaN(lastNum)) {
      sequence = lastNum + 1;
    }
  }
  return Array.from({ length: count }, (_, index) => {
    const next = sequence + index;
    return `${prefix}${String(next).padStart(4, "0")}`;
  });
};

const invoiceCreateSelect = {
  id: true,
  caseId: true,
  invoiceBatchId: true,
  invoiceNumber: true,
  invoiceType: true,
  invoiceStatus: true,
  paymentStatus: true,
  payerCasePartyId: true,
  amountDue: true,
  subtotal: true,
  taxRate: true,
  taxAmount: true,
  dueDate: true,
  createdAt: true,
  payerCaseParty: {
    select: {
      id: true,
      side: true,
      partyType: true,
      firstName: true,
      lastName: true,
      organizationName: true,
      email: true,
      state: true,
    },
  },
};

const BILLING_FORM_OPTIONS = Object.freeze({
  feeTypes: [
    { value: "HOURLY", label: "Hourly" },
    { value: "DAILY", label: "Daily" },
    { value: "FLAT", label: "Flat Rate" },
    { value: "HYBRID", label: "Hybrid (Flat + Overage)" },
    { value: "CUSTOM", label: "Custom" },
  ],
  billingInputSources: [
    { value: BillingInputSource.FIRM_INVOICE, label: "Firm Invoice" },
    {
      value: BillingInputSource.PLATFORM_TIMESHEETS,
      label: "Platform Timesheets",
    },
  ],
  expensePolicies: [
    { value: BillingExpensesPolicy.ALLOWED, label: "Allowed" },
    {
      value: BillingExpensesPolicy.BILLABLE_AS_INCURRED,
      label: "Allowed with receipts",
    },
    { value: BillingExpensesPolicy.NOT_ALLOWED, label: "Not Allowed" },
  ],
  travelTimeRateTypes: [
    { value: TravelTimeRateType.FREE, label: "Free" },
    { value: TravelTimeRateType.CUSTOM_HOURLY, label: "Custom Hourly Rate" },
    { value: TravelTimeRateType.FULL_HOURLY, label: "Full Hourly Rate" },
  ],
  billingModes: [
    { value: BillingMode.DEPOSIT_BASED, label: "Deposit-based" },
    { value: BillingMode.MILESTONE, label: "Progress billing" },
    { value: BillingMode.STANDARD, label: "Final invoice only" },
  ],
  fedArbFeeTypes: [
    { value: "ARBITRATION", label: "Arbitration" },
    { value: "MEDIATION", label: "Mediation" },
    { value: "EXPERT", label: "Expert" },
  ],
  timekeeperRoles: ["Associate", "Paralegal", "Law Clerk", "Co-Neutral"],
  timekeeperRates: [150, 200, 250, 300, 350],
});

const userDisplayName = (user) => {
  if (!user) return null;
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.email ||
    null
  );
};

const inferUiFeeType = (config) => {
  if (!config?.billingType) return null;
  if (config.billingType === BillingType.FLAT) return "FLAT";
  if (config.billingType === BillingType.HYBRID) {
    return config.customRate != null ? "CUSTOM" : "HYBRID";
  }
  if (
    config.billingType === BillingType.HOURLY &&
    config.neutralDailyRate != null &&
    config.neutralHourlyRate == null
  ) {
    return "DAILY";
  }
  return "HOURLY";
};

const inferUiFedArbFeeType = (storedType) => {
  if (!storedType) return null;
  return storedType === "CUSTOM_ADR" ? "EXPERT" : storedType;
};

const buildInvoiceContacts = (party) => {
  const contacts = [];
  const addContact = (contact) => {
    if (!contact.name && !contact.email) return;
    const key = `${contact.email || ""}:${contact.name || ""}`.toLowerCase();
    if (!contacts.some((item) => item.key === key)) {
      contacts.push({ ...contact, key });
    }
  };

  addContact({
    id: `party:${party.id}`,
    type: "PARTY",
    name: partyDisplayName(party),
    email: party.email || null,
  });

  for (const representation of party.representations || []) {
    const attorney = representation.attorney;
    addContact({
      id: `attorney:${attorney.id}`,
      type: "ATTORNEY",
      designation: representation.designation,
      name: userDisplayName(attorney),
      email: attorney.email || null,
    });
  }

  for (const participant of party.caseParticipants || []) {
    addContact({
      id: `user:${participant.user.id}`,
      type: participant.role,
      name: userDisplayName(participant.user),
      email: participant.user.email || null,
    });
  }

  return contacts.map(({ key, ...contact }) => contact);
};

const buildCaseBillingConfigResponse = (caseContext, config) => {
  const caseManagers = (caseContext.participants || [])
    .filter((participant) => participant.role === "CASE_MANAGER")
    .map((participant) => ({
      ...participant.user,
      isPrimary: participant.isPrimary,
      name: userDisplayName(participant.user),
    }));
  const neutrals = (caseContext.participants || [])
    .filter((participant) => participant.role === "NEUTRAL")
    .map((participant) => ({
      ...participant.user,
      isPrimary: participant.isPrimary,
      name: userDisplayName(participant.user),
    }));
  const payerOptions = (caseContext.parties || []).map((party) => ({
    id: party.id,
    casePartyId: party.id,
    label: partyDisplayName(party),
    side: party.side,
    partyType: party.partyType,
    email: party.email || null,
    invoiceContacts: buildInvoiceContacts(party),
  }));
  const configured = isBillingConfigComplete(config);

  return {
    caseId: caseContext.id,
    caseInfo: {
      caseNumber: caseContext.caseNumber,
      caseStatus: caseContext.lifecycleStatus,
      lifecycleStatus: caseContext.lifecycleStatus,
      matterName: caseContext.inquiry?.matterName || caseContext.title,
      title: caseContext.title,
      caseType: caseContext.caseTypeLabel || caseContext.caseType,
      caseTypeCode: caseContext.caseType,
      disputeType: caseContext.disputeCategory?.name || null,
      caseManager:
        caseManagers
          .map((user) => user.name)
          .filter(Boolean)
          .join(", ") || null,
      neutral:
        neutrals
          .map((user) => user.name)
          .filter(Boolean)
          .join(", ") || null,
      caseManagers,
      neutrals,
    },
    configuration: config
      ? {
          ...config,
          feeType: inferUiFeeType(config),
          fedArbFeeType: inferUiFedArbFeeType(config.fedArbFeeScheduleType),
        }
      : null,
    payerOptions,
    formOptions: BILLING_FORM_OPTIONS,
    configured,
    status: configured ? "CONFIGURED" : "INCOMPLETE",
  };
};

const getCaseBillingConfig = async (caseId, currentUser) => {
  if (!isAuthorizedForBilling(currentUser)) {
    throw new ApiError(
      403,
      "You do not have permission to view billing configuration.",
    );
  }
  await caseService.getCaseById(caseId, currentUser);
  const [caseContext, config] = await Promise.all([
    billingRepository.findBillingCaseContextById(caseId),
    billingRepository.findBillingConfigByCaseId(caseId),
  ]);
  return buildCaseBillingConfigResponse(caseContext, config);
};

const validatePayerSplitsForCase = async (caseId, payload) => {
  const { splitBillingEnabled, payerSplits, roundingResidualCasePartyId } =
    payload;

  const splits = payerSplits || [];
  if (splits.length === 0) {
    throw new ApiError(
      400,
      "At least one payer and invoice contact are required.",
    );
  }
  if (!splitBillingEnabled && splits.length > 1) {
    throw new ApiError(
      400,
      "Only one payer is allowed when split billing is disabled.",
    );
  }

  const partyIds = [...new Set(splits.map((row) => row.casePartyId))];
  if (partyIds.length !== splits.length) {
    throw new ApiError(
      400,
      "Duplicate payers are not allowed in split billing.",
    );
  }

  const parties = await billingRepository.findCasePartyIds(caseId, partyIds);
  if (parties.length !== partyIds.length) {
    throw new ApiError(
      400,
      "One or more payer parties do not belong to this case.",
    );
  }

  if (
    splits.some(
      (row) => !row.invoiceContactEmail && !row.invoiceContactName?.trim(),
    )
  ) {
    throw new ApiError(400, "An invoice contact is required for every payer.");
  }

  if (splitBillingEnabled) {
    if (splits.some((row) => row.splitPercentage == null)) {
      throw new ApiError(
        400,
        "A split percentage is required for every payer when split billing is enabled.",
      );
    }
    const total = splits.reduce(
      (sum, row) => sum + Number(row.splitPercentage || 0),
      0,
    );
    if (Math.abs(total - 100) > 0.01) {
      throw new ApiError(
        400,
        "Split percentages must total exactly 100% when split billing is enabled.",
      );
    }
    if (!roundingResidualCasePartyId) {
      throw new ApiError(
        400,
        "Rounding residual payer is required when split billing is enabled.",
      );
    }
  }

  if (
    roundingResidualCasePartyId &&
    !partyIds.includes(roundingResidualCasePartyId)
  ) {
    throw new ApiError(
      400,
      "Rounding residual payer must be one of the configured payer splits.",
    );
  }
};

const partyDisplayName = (party) => {
  if (!party) return null;
  return (
    party.organizationName ||
    [party.firstName, party.lastName].filter(Boolean).join(" ").trim() ||
    null
  );
};

const isBillingConfigComplete = (config) => {
  if (!config) return false;
  if (!config.billingType) return false;
  const splits = config.payerSplits || [];
  if (splits.length === 0) return false;
  const everyPayerHasContact = splits.every(
    (s) => s.invoiceContactEmail || s.invoiceContactName,
  );
  if (!everyPayerHasContact) return false;
  if (config.splitBillingEnabled) {
    const total = splits.reduce(
      (sum, s) => sum + Number(s.splitPercentage || 0),
      0,
    );
    if (Math.abs(total - 100) > 0.01) return false;
    if (!config.roundingResidualCasePartyId) return false;
  } else if (splits.length !== 1) {
    return false;
  }
  return true;
};

const formatNeutralFeeSummary = (config) => {
  if (!config) return null;
  const parts = [];
  if (config.billingType) parts.push(config.billingType);
  if (config.neutralHourlyRate != null) {
    parts.push(`$${Number(config.neutralHourlyRate).toFixed(2)}/hr`);
  } else if (config.neutralDailyRate != null) {
    parts.push(`$${Number(config.neutralDailyRate).toFixed(2)}/day`);
  } else if (config.flatFeeAmount != null) {
    parts.push(`$${Number(config.flatFeeAmount).toFixed(2)} flat`);
  } else if (config.customRate != null) {
    parts.push(`$${Number(config.customRate).toFixed(2)} custom`);
  }
  return parts.length ? parts.join(" · ") : null;
};

const computeInvoiceBalances = (invoice, now = new Date()) => {
  const amountDue = Number(invoice.amountDue || 0);
  const paid = (invoice.payments || []).reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0,
  );
  const credited = (invoice.creditNotes || []).reduce(
    (sum, c) => sum + Number(c.amount || 0),
    0,
  );
  const openBalance = roundMoney(Math.max(0, amountDue - paid - credited));
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dueDay = dueDate
    ? new Date(
        Date.UTC(
          dueDate.getUTCFullYear(),
          dueDate.getUTCMonth(),
          dueDate.getUTCDate(),
        ),
      )
    : null;
  const overdue =
    openBalance > 0 &&
    dueDay &&
    dueDay < today &&
    invoice.paymentStatus !== PaymentStatus.PAID &&
    invoice.invoiceStatus !== InvoiceStatus.VOID;
  const agingBucket = (() => {
    if (openBalance <= 0 || !dueDate) return null;
    const diffDays = Math.floor((today - dueDay) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return "current";
    if (diffDays <= 30) return "1-30";
    if (diffDays <= 60) return "31-60";
    if (diffDays <= 90) return "61-90";
    return "90+";
  })();
  return {
    amountDue,
    amountPaid: roundMoney(paid),
    amountCredited: roundMoney(credited),
    openBalance,
    overdue: Boolean(overdue),
    agingBucket,
  };
};

const hasBillingPermission = (currentUser, action) => {
  if (currentUser?.role?.name === "SUPER_ADMIN") return true;
  return Boolean(
    currentUser?.role?.rolePermissions?.some(
      ({ permission }) =>
        permission.module === PermissionModule.BILLING &&
        permission.action === action,
    ),
  );
};

const buildInvoiceAllowedActions = (invoice, currentUser) => {
  const actions = ["VIEW", "DOWNLOAD"];
  const canCreate = hasBillingPermission(currentUser, PermissionAction.CREATE);
  const canEdit = hasBillingPermission(currentUser, PermissionAction.EDIT);
  const canApprove = hasBillingPermission(
    currentUser,
    PermissionAction.APPROVE,
  );
  const balances = computeInvoiceBalances(invoice);

  if (invoice.invoiceStatus === InvoiceStatus.DRAFT) {
    if (
      canEdit &&
      [
        InvoiceReviewStatus.NOT_SUBMITTED,
        InvoiceReviewStatus.CHANGES_REQUESTED,
      ].includes(invoice.reviewStatus)
    ) {
      actions.push("EDIT", "SUBMIT_FOR_REVIEW");
    }
    if (
      canApprove &&
      invoice.reviewStatus === InvoiceReviewStatus.PENDING_REVIEW &&
      invoice.submittedForReviewByUserId !== currentUser?.id
    ) {
      actions.push("APPROVE_REVIEW", "REQUEST_CHANGES");
    }
    if (canApprove && invoice.reviewStatus === InvoiceReviewStatus.APPROVED) {
      actions.push("FINALIZE");
    }
  }

  if (
    [InvoiceStatus.ISSUED, InvoiceStatus.SENT, InvoiceStatus.OVERDUE].includes(
      invoice.invoiceStatus,
    )
  ) {
    if (canEdit) actions.push("SEND");
    if (
      canEdit &&
      !(invoice.payments || []).length &&
      !(invoice.creditNotes || []).length
    ) {
      actions.push("VOID");
    }
    if (canCreate && balances.openBalance > 0) {
      actions.push("RECORD_PAYMENT", "CREATE_CREDIT_NOTE");
    }
  }

  if (invoice.invoiceStatus === InvoiceStatus.VOID && canCreate) {
    actions.push("REISSUE");
  }
  return actions;
};

const mapInvoiceHistory = (history = []) =>
  history.map((event) => ({
    id: event.id,
    action: event.action,
    reason: event.reason || null,
    occurredAt: event.createdAt,
    actor: event.actingUser
      ? {
          id: event.actingUser.id,
          displayName: userDisplayName(event.actingUser),
          email: event.actingUser.email,
        }
      : null,
    previousValue: event.previousValue,
    newValue: event.newValue,
  }));

const buildCanonicalInvoice = (
  invoice,
  currentUser,
  { history = [], now = new Date() } = {},
) => {
  const balances = computeInvoiceBalances(invoice, now);
  const participants = invoice.case?.participants || [];
  const caseManagers = participants
    .filter((participant) => participant.role === "CASE_MANAGER")
    .map((participant) => participant.user);
  const neutrals = participants
    .filter((participant) => participant.role === "NEUTRAL")
    .map((participant) => participant.user);
  const payer = invoice.payerCaseParty;
  const payerSplit = invoice.case?.billingConfiguration?.payerSplits?.find(
    (split) => split.casePartyId === invoice.payerCasePartyId,
  );
  const attachments = (invoice.invoiceBatch?.attachments || []).map(
    (attachment) => ({
      id: attachment.id,
      documentId: attachment.documentId,
      filename: attachment.document?.name || null,
      description: attachment.document?.description || null,
      mimeType: attachment.document?.currentVersion?.mimeType || null,
      sizeBytes: attachment.document?.currentVersion?.fileSizeBytes || null,
      category: attachment.attachmentType,
      includedByDefault: attachment.isSelected,
      downloadPath: `/api/v1/cases/${invoice.caseId}/documents/${attachment.documentId}/download`,
    }),
  );
  const invoiceContact = {
    id: payerSplit?.id || null,
    name: payerSplit?.invoiceContactName || partyDisplayName(payer),
    email: payerSplit?.invoiceContactEmail || payer?.email || null,
  };

  return {
    ...invoice,
    batchId: invoice.invoiceBatchId || null,
    issuedAt: invoice.finalizedAt || null,
    matterName: invoice.case?.title || null,
    caseManager:
      caseManagers.map(userDisplayName).filter(Boolean).join(", ") || null,
    neutral: neutrals.map(userDisplayName).filter(Boolean).join(", ") || null,
    payer: partyDisplayName(payer),
    payerContact: payer
      ? {
          name: partyDisplayName(payer),
          email: payer.email || null,
          phone: payer.phone || null,
        }
      : null,
    invoiceContact,
    caseSummary: {
      id: invoice.case?.id || invoice.caseId,
      caseNumber: invoice.case?.caseNumber || null,
      title: invoice.case?.title || null,
      caseType: invoice.case?.caseType || null,
      caseManager: caseManagers[0]
        ? {
            id: caseManagers[0].id,
            displayName: userDisplayName(caseManagers[0]),
          }
        : null,
      neutral: neutrals[0]
        ? {
            id: neutrals[0].id,
            displayName: userDisplayName(neutrals[0]),
          }
        : null,
    },
    payerDetails: payer
      ? {
          casePartyId: payer.id,
          displayName: partyDisplayName(payer),
          side: payer.side,
          email: payer.email || null,
          state: payer.state || null,
        }
      : null,
    amounts: {
      currency: invoice.currency || "USD",
      subtotal: Number(invoice.subtotal || 0),
      taxAmount: Number(invoice.taxAmount || 0),
      totalAmount: balances.amountDue,
      amountPaid: balances.amountPaid,
      amountCredited: balances.amountCredited,
      openBalance: balances.openBalance,
    },
    amount: balances.amountDue,
    totalAmount: balances.amountDue,
    amountPaid: balances.amountPaid,
    amountCredited: balances.amountCredited,
    openBalance: balances.openBalance,
    overdue: balances.overdue,
    agingBucket: balances.agingBucket,
    review: {
      status: invoice.reviewStatus,
      notes: invoice.reviewNotes || null,
      decisionNotes: invoice.reviewDecisionNotes || null,
      submittedAt: invoice.submittedForReviewAt || null,
      submittedBy: invoice.submittedForReviewBy
        ? {
            id: invoice.submittedForReviewBy.id,
            displayName: userDisplayName(invoice.submittedForReviewBy),
          }
        : null,
      reviewedAt: invoice.reviewedAt || null,
      reviewedBy: invoice.reviewedBy
        ? {
            id: invoice.reviewedBy.id,
            displayName: userDisplayName(invoice.reviewedBy),
          }
        : null,
    },
    lifecycle: {
      createdAt: invoice.createdAt,
      submittedForReviewAt: invoice.submittedForReviewAt || null,
      reviewedAt: invoice.reviewedAt || null,
      finalizedAt: invoice.finalizedAt || null,
      sentAt: invoice.sentAt || null,
      voidedAt: invoice.voidedAt || null,
    },
    attachments,
    distributions: [
      {
        invoiceId: invoice.id,
        payer: partyDisplayName(payer),
        casePartyId: payer?.id || null,
        invoiceContact,
        splitPercentage: payerSplit ? Number(payerSplit.splitPercentage) : 100,
        allocatedAmount: balances.amountDue,
        sentAt: invoice.sentAt || null,
      },
    ],
    quickBooks: {
      status: invoice.quickBooksSyncStatus || null,
      referenceId: invoice.quickBooksInvoiceId || null,
      lastSyncedAt: invoice.quickBooksLastSyncedAt || null,
    },
    qbSync: invoice.quickBooksSyncStatus,
    payment: invoice.paymentStatus,
    status: invoice.invoiceStatus,
    allowedActions: buildInvoiceAllowedActions(invoice, currentUser),
    history: mapInvoiceHistory(history),
  };
};

const saveCaseBillingConfig = async (
  caseId,
  payload,
  currentUser,
  operation,
) => {
  await assertCanMutateCaseBilling(caseId, currentUser);
  await caseService.getCaseById(caseId, currentUser);

  const [caseContext, existing] = await Promise.all([
    billingRepository.findBillingCaseContextById(caseId),
    billingRepository.findBillingConfigByCaseId(caseId),
  ]);

  if (operation === "create" && existing) {
    throw new ApiError(
      409,
      "A billing configuration already exists for this case.",
    );
  }
  if (operation === "update" && !existing) {
    throw new ApiError(404, "Billing configuration not found for this case.");
  }

  const normalizedPayload = normalizeBillingConfigPayload(payload);
  const splitBillingEnabled = Object.prototype.hasOwnProperty.call(
    normalizedPayload,
    "splitBillingEnabled",
  )
    ? normalizedPayload.splitBillingEnabled
    : Boolean(existing?.splitBillingEnabled);

  if (Array.isArray(normalizedPayload.payerSplits)) {
    normalizedPayload.payerSplits = normalizedPayload.payerSplits.map(
      (row) => ({
        ...row,
        splitPercentage: splitBillingEnabled ? row.splitPercentage : 100,
      }),
    );
  }
  if (!splitBillingEnabled) {
    normalizedPayload.roundingResidualCasePartyId = null;
  }

  const effectiveConfiguration = {
    ...(existing || {}),
    ...normalizedPayload,
    splitBillingEnabled,
    payerSplits: Array.isArray(normalizedPayload.payerSplits)
      ? normalizedPayload.payerSplits
      : existing?.payerSplits || [],
  };

  if (
    effectiveConfiguration.travelTimeRateType ===
      TravelTimeRateType.CUSTOM_HOURLY &&
    effectiveConfiguration.travelTimeCustomHourlyRate == null
  ) {
    throw new ApiError(
      400,
      "travelTimeCustomHourlyRate is required when travel time uses a custom hourly rate.",
    );
  }

  await validatePayerSplitsForCase(caseId, effectiveConfiguration);
  const { payerSplits, additionalTimekeepers, ...rest } = normalizedPayload;

  const scalarData = {};
  for (const key of BILLING_CONFIG_SCALAR_KEYS) {
    if (Object.prototype.hasOwnProperty.call(rest, key)) {
      scalarData[key] =
        key === "deliveryContactEmail" ||
        key === "billingNotes" ||
        key === "customRateDescription"
          ? emptyToNull(rest[key])
          : rest[key];
    }
  }

  if (
    scalarData.splitBillingEnabled === false &&
    scalarData.roundingResidualCasePartyId === undefined
  ) {
    scalarData.roundingResidualCasePartyId = null;
  }

  const normalizedPayerSplits =
    payerSplits === undefined
      ? undefined
      : payerSplits.map((row) => ({
          casePartyId: row.casePartyId,
          invoiceContactEmail: emptyToNull(row.invoiceContactEmail),
          invoiceContactName: emptyToNull(row.invoiceContactName),
          splitPercentage: row.splitPercentage,
        }));

  const normalizedTimekeepers =
    additionalTimekeepers === undefined
      ? undefined
      : additionalTimekeepers.map((row) => ({
          role: row.role,
          hourlyRate: row.hourlyRate,
          expensesAllowed: row.expensesAllowed || "NOT_ALLOWED",
        }));

  return runTransaction(async (tx) => {
    const previous = await billingRepository.findBillingConfigByCaseId(
      caseId,
      tx,
    );
    const saved = await billingRepository.upsertBillingConfig(
      caseId,
      {
        scalarData,
        payerSplits: normalizedPayerSplits,
        additionalTimekeepers: normalizedTimekeepers,
      },
      tx,
    );

    await billingRepository.createBillingAuditLog(
      {
        actingUserId: currentUser.id,
        actingUserRoleSnapshot: currentUser.role?.name || null,
        action: previous
          ? "UPDATE_BILLING_CONFIGURATION"
          : "CREATE_BILLING_CONFIGURATION",
        module: "BILLING",
        affectedRecordType: "BillingConfiguration",
        affectedRecordId: saved.id,
        previousValue: previous ? JSON.parse(JSON.stringify(previous)) : null,
        newValue: JSON.parse(JSON.stringify(saved)),
      },
      tx,
    );

    return buildCaseBillingConfigResponse(caseContext, saved);
  });
};

const createCaseBillingConfig = (caseId, payload, currentUser) =>
  saveCaseBillingConfig(caseId, payload, currentUser, "create");

const updateCaseBillingConfig = (caseId, payload, currentUser) =>
  saveCaseBillingConfig(caseId, payload, currentUser, "update");

const upsertCaseBillingConfig = (caseId, payload, currentUser) =>
  saveCaseBillingConfig(caseId, payload, currentUser, "upsert");

const getBillingConfigurationsList = async (query, currentUser) => {
  if (!isAuthorizedForBilling(currentUser)) {
    throw new ApiError(
      403,
      "You do not have permission to view billing configurations.",
    );
  }
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = (page - 1) * limit;
  const requestedStatus =
    query.status === "NOT_CONFIGURED" ? "INCOMPLETE" : query.status;
  const payerCasePartyId = query.payerCasePartyId || query.payerPartyId;
  const updatedFrom = query.updatedFrom || query.fromDate;
  const updatedTo = query.updatedTo || query.toDate;

  const caseWhere = {};
  const caseScopeConditions = [];
  const caseScope = buildBillingCaseScope(currentUser);
  if (Object.keys(caseScope).length > 0) {
    caseScopeConditions.push(caseScope);
  }

  if (query.caseStatus) {
    caseWhere.lifecycleStatus = query.caseStatus;
  }
  if (query.caseType) {
    caseWhere.caseType = query.caseType;
  }
  if (query.neutralUserId) {
    caseScopeConditions.push({
      participants: {
        some: {
          userId: query.neutralUserId,
          role: "NEUTRAL",
          accessStatus: "ACTIVE",
        },
      },
    });
  }

  if (caseScopeConditions.length === 1) {
    Object.assign(caseWhere, caseScopeConditions[0]);
  } else if (caseScopeConditions.length > 1) {
    caseWhere.AND = caseScopeConditions;
  }
  const billingConfigurationFilter = {};
  if (query.billingType) {
    billingConfigurationFilter.billingType = normalizeBillingTypeInput(
      query.billingType,
    );
  }
  if (query.billingInputSource) {
    billingConfigurationFilter.billingInputSource =
      normalizeBillingInputSourceInput(query.billingInputSource);
  }
  if (query.billingMode) {
    billingConfigurationFilter.billingMode = normalizeBillingModeInput(
      query.billingMode,
    );
  }
  if (payerCasePartyId) {
    billingConfigurationFilter.payerSplits = {
      some: { casePartyId: payerCasePartyId },
    };
  }

  if (Object.keys(billingConfigurationFilter).length > 0) {
    caseWhere.billingConfiguration = billingConfigurationFilter;
  }

  // Completeness, display-name search, and effective last-update values depend on
  // related records. Fetch the scoped candidates first, then filter and paginate
  // the fully enriched rows so totals never describe a different result set.
  const { cases } = await billingRepository.getCasesWithOrWithoutBilling({
    where: caseWhere,
    orderBy: { createdAt: "desc" },
  });

  let enrichedCases = cases.map((c) => {
    const config = c.billingConfiguration;
    const configured = isBillingConfigComplete(config);
    const splits = config?.payerSplits || [];
    const primarySplit = splits[0] || null;
    const payerNames = splits
      .map((s) => {
        const party = (c.parties || []).find((p) => p.id === s.casePartyId);
        return partyDisplayName(party);
      })
      .filter(Boolean);
    const neutrals = (c.participants || []).map((p) => p.user);
    const matterName = c.inquiry?.matterName || c.title;
    const lastUpdate = config?.updatedAt || c.updatedAt;
    return {
      caseId: c.id,
      caseNumber: c.caseNumber,
      title: c.title,
      matterName,
      caseType: c.caseType,
      lifecycleStatus: c.lifecycleStatus,
      caseStatus: c.lifecycleStatus,
      parties: c.parties,
      neutrals,
      neutral:
        neutrals
          .map((u) =>
            [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim(),
          )
          .filter(Boolean)
          .join(", ") || null,
      payer: payerNames.join(", ") || null,
      billingInputType: config?.billingInputSource || null,
      billingInputSource: config?.billingInputSource || null,
      neutralFee: formatNeutralFeeSummary(config),
      fedarbFee:
        config?.fedArbFeeScheduleType ||
        (config?.setupFee != null || config?.administrationFee != null
          ? "Configured"
          : null),
      splitBilling: config?.splitBillingEnabled ? "Yes" : "No",
      splitBillingEnabled: Boolean(config?.splitBillingEnabled),
      invoiceContact: primarySplit
        ? {
            name: primarySplit.invoiceContactName || null,
            email: primarySplit.invoiceContactEmail || null,
          }
        : null,
      configuration: config,
      feeSummary: {
        billingType: config?.billingType || null,
        neutralHourlyRate: config?.neutralHourlyRate
          ? Number(config.neutralHourlyRate)
          : null,
        flatFeeAmount: config?.flatFeeAmount
          ? Number(config.flatFeeAmount)
          : null,
        setupFee: config?.setupFee ? Number(config.setupFee) : null,
        administrationFee: config?.administrationFee
          ? Number(config.administrationFee)
          : null,
      },
      splitSummary: {
        enabled: Boolean(config?.splitBillingEnabled),
        payerCount: splits.length,
        totalPercentage: splits.reduce(
          (sum, s) => sum + Number(s.splitPercentage || 0),
          0,
        ),
      },
      configured,
      status: configured ? "CONFIGURED" : "INCOMPLETE",
      lastUpdate,
      createdAt: c.createdAt,
      caseUpdatedAt: c.updatedAt,
      updatedAt: lastUpdate,
    };
  });

  if (query.search) {
    const normalizedSearch = query.search.toLocaleLowerCase();
    enrichedCases = enrichedCases.filter((row) => {
      const searchableValues = [
        row.caseNumber,
        row.title,
        row.matterName,
        row.neutral,
        row.payer,
      ];
      return searchableValues.some((value) =>
        String(value || "")
          .toLocaleLowerCase()
          .includes(normalizedSearch),
      );
    });
  }

  if (requestedStatus === "CONFIGURED") {
    enrichedCases = enrichedCases.filter((row) => row.configured);
  } else if (requestedStatus === "INCOMPLETE") {
    enrichedCases = enrichedCases.filter((row) => !row.configured);
  }

  if (updatedFrom || updatedTo) {
    const fromTime = updatedFrom ? new Date(updatedFrom).getTime() : null;
    const toTime = updatedTo ? endOfUtcDay(updatedTo).getTime() : null;
    enrichedCases = enrichedCases.filter((row) => {
      const updatedTime = new Date(row.lastUpdate).getTime();
      return (
        (fromTime === null || updatedTime >= fromTime) &&
        (toTime === null || updatedTime <= toTime)
      );
    });
  }

  const direction = query.sortOrder === "asc" ? 1 : -1;
  const sortBy = query.sortBy || "createdAt";
  enrichedCases.sort((left, right) => {
    let comparison;
    if (sortBy === "caseNumber" || sortBy === "title") {
      comparison = String(left[sortBy] || "").localeCompare(
        String(right[sortBy] || ""),
        undefined,
        { numeric: true, sensitivity: "base" },
      );
    } else {
      comparison =
        new Date(left[sortBy] || 0).getTime() -
        new Date(right[sortBy] || 0).getTime();
    }
    if (comparison === 0) {
      comparison = left.caseId.localeCompare(right.caseId);
    }
    return comparison * direction;
  });

  const total = enrichedCases.length;
  return paginate(
    enrichedCases.slice(skip, skip + limit),
    total,
    page,
    limit,
    "configurations",
  );
};

const getApprovedTimesheets = async (query, currentUser) => {
  if (!isAuthorizedForBilling(currentUser)) {
    throw new ApiError(
      403,
      "You do not have permission to view approved timesheets.",
    );
  }
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  let where = {
    approvalStatus: TimesheetApprovalStatus.APPROVED,
  };

  where = applyBillingCaseFilter(where, currentUser);
  if (currentUser?.role?.name === "NEUTRAL") {
    where.neutralUserId = currentUser.id;
  }

  await assertCaseAccessIfProvided(query.caseId, currentUser);
  if (query.caseId) where.caseId = query.caseId;
  if (query.hearingId) where.hearingId = query.hearingId;
  if (query.hearingOnly === true || query.hearingOnly === "true") {
    where.hearingId = { not: null };
  } else if (query.hearingOnly === false || query.hearingOnly === "false") {
    where.hearingId = null;
  }
  if (query.neutralUserId) where.neutralUserId = query.neutralUserId;
  if (query.activityType) where.activityType = query.activityType;

  if (query.search) {
    where.OR = [
      { billingNotes: { contains: query.search, mode: "insensitive" } },
      {
        neutral: {
          firstName: { contains: query.search, mode: "insensitive" },
        },
      },
      {
        neutral: {
          lastName: { contains: query.search, mode: "insensitive" },
        },
      },
      {
        neutral: { email: { contains: query.search, mode: "insensitive" } },
      },
      {
        case: {
          caseNumber: { contains: query.search, mode: "insensitive" },
        },
      },
      {
        case: { title: { contains: query.search, mode: "insensitive" } },
      },
      {
        case: {
          inquiry: {
            matterName: { contains: query.search, mode: "insensitive" },
          },
        },
      },
      {
        hearing: {
          hearingReference: {
            contains: query.search,
            mode: "insensitive",
          },
        },
      },
      {
        hearing: { title: { contains: query.search, mode: "insensitive" } },
      },
    ];
  }

  if (query.fromDate || query.toDate) {
    where.entryDate = {
      ...(query.fromDate && { gte: new Date(query.fromDate) }),
      ...(query.toDate && { lte: endOfUtcDay(query.toDate) }),
    };
  }

  if (query.invoiceAssociation === "UNASSIGNED") {
    where.lineItems = { none: {} };
  } else if (query.invoiceAssociation === "DRAFT") {
    where.lineItems = {
      some: {
        invoice: { invoiceStatus: InvoiceStatus.DRAFT },
      },
    };
  } else if (query.invoiceAssociation === "INVOICED") {
    where.lineItems = {
      some: {
        invoice: {
          invoiceStatus: {
            in: [
              InvoiceStatus.ISSUED,
              InvoiceStatus.SENT,
              InvoiceStatus.OVERDUE,
            ],
          },
        },
      },
    };
  }

  const { timesheets, total } = await billingRepository.findApprovedTimesheets({
    where,
    skip,
    take: limit,
    orderBy: { entryDate: query.sortOrder === "asc" ? "asc" : "desc" },
  });

  const formatted = timesheets.map((ts) => {
    let associationStatus = "UNASSIGNED";
    let activeInvoice = null;
    if (ts.lineItems && ts.lineItems.length > 0) {
      const draftItem = ts.lineItems.find(
        (li) => li.invoice?.invoiceStatus === InvoiceStatus.DRAFT,
      );
      if (draftItem) {
        associationStatus = "DRAFT";
        activeInvoice = draftItem.invoice;
      } else {
        const invoicedItem = ts.lineItems.find(
          (li) => li.invoice?.invoiceStatus !== InvoiceStatus.VOID,
        );
        if (invoicedItem) {
          associationStatus = "INVOICED";
          activeInvoice = invoicedItem.invoice;
        }
      }
    }
    const billingConfig = ts.case?.billingConfiguration || null;
    const rate = resolveTimesheetRate(ts.activityType, billingConfig, {});
    const hours = Number(ts.hours || 0);
    const amount = roundMoney(hours * rate);
    const expensesTotal = (ts.expenses || []).reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
    const receipts = (ts.expenses || []).flatMap((expense) =>
      (expense.receipts || []).map((receipt) => ({
        id: receipt.id,
        documentId: receipt.documentId,
        expenseId: expense.id,
        filename: receipt.document?.name || null,
        mimeType: receipt.document?.currentVersion?.mimeType || null,
        sizeBytes: receipt.document?.currentVersion?.fileSizeBytes || null,
      })),
    );
    return {
      ...ts,
      matterName: ts.case?.inquiry?.matterName || ts.case?.title || null,
      rate,
      amount,
      expensesTotal,
      approver: ts.approvedBy
        ? {
            id: ts.approvedBy.id,
            displayName: userDisplayName(ts.approvedBy),
            email: ts.approvedBy.email,
          }
        : null,
      receipts,
      associationStatus,
      activeInvoice,
    };
  });

  return paginate(formatted, total, page, limit, "timesheets");
};

const resolveTimesheetRate = (
  activityType,
  billingConfig,
  trackedHoursByBucket,
) => {
  const neutralRate = billingConfig?.neutralHourlyRate
    ? Number(billingConfig.neutralHourlyRate)
    : 0;
  const cmRate = billingConfig?.caseManagementHourlyRate
    ? Number(billingConfig.caseManagementHourlyRate)
    : 0;
  const overageRate = billingConfig?.overageHourlyRate
    ? Number(billingConfig.overageHourlyRate)
    : neutralRate;
  const includedPrePost = billingConfig?.includedPrePostHearingHours
    ? Number(billingConfig.includedPrePostHearingHours)
    : null;

  if (activityType === "CASE_MANAGEMENT") {
    return cmRate || neutralRate;
  }

  if (PRE_POST_ACTIVITY_TYPES.has(activityType) && includedPrePost !== null) {
    const used = trackedHoursByBucket.prePost || 0;
    if (used >= includedPrePost) {
      return overageRate || neutralRate;
    }
  }

  return neutralRate;
};

const buildDistribution = (invoices, billingConfig) =>
  invoices.map((invoice) => {
    const split = billingConfig?.payerSplits?.find(
      (row) => row.casePartyId === invoice.payerCasePartyId,
    );
    const party = invoice.payerCaseParty;
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      payerCasePartyId: invoice.payerCasePartyId,
      payerName:
        party?.organizationName ||
        [party?.firstName, party?.lastName].filter(Boolean).join(" ") ||
        null,
      invoiceContactEmail: split?.invoiceContactEmail || party?.email || null,
      invoiceContactName: split?.invoiceContactName || null,
      state: party?.state || null,
      splitPercentage: split ? Number(split.splitPercentage) : null,
      amount: Number(invoice.amountDue),
    };
  });

const scaleLineItemsForSplit = (lineItems, splitPct, isResidual, fullTotal) => {
  const scaled = lineItems.map((item) => {
    const amount = roundMoney((item.amount * splitPct) / 100);
    return {
      ...item,
      amount,
      unitPrice:
        item.quantity && Number(item.quantity) !== 0
          ? roundMoney(amount / Number(item.quantity))
          : amount,
    };
  });
  let subtotal = roundMoney(scaled.reduce((acc, curr) => acc + curr.amount, 0));
  if (isResidual && scaled.length > 0) {
    const expectedShare = roundMoney((fullTotal * splitPct) / 100);
    const delta = roundMoney(expectedShare - subtotal);
    if (delta !== 0) {
      const last = scaled[scaled.length - 1];
      last.amount = roundMoney(last.amount + delta);
      last.unitPrice =
        last.quantity && Number(last.quantity) !== 0
          ? roundMoney(last.amount / Number(last.quantity))
          : last.amount;
      subtotal = roundMoney(subtotal + delta);
    }
  }
  return { lineItems: scaled, subtotal };
};

const validateInvoiceAttachmentDocuments = async (caseId, attachments) => {
  const rows = attachments || [];
  if (rows.length === 0) return [];
  const documentIds = [...new Set(rows.map((row) => row.documentId))];
  if (documentIds.length !== rows.length) {
    throw new ApiError(400, "Duplicate invoice attachments are not allowed.");
  }
  const documents = await billingRepository.findInvoiceAttachmentDocuments(
    caseId,
    documentIds,
  );
  if (documents.length !== documentIds.length) {
    throw new ApiError(
      400,
      "One or more invoice attachment documents are missing, deleted, or belong to another case.",
    );
  }
  const byId = new Map(documents.map((document) => [document.id, document]));
  for (const attachment of rows) {
    const document = byId.get(attachment.documentId);
    if (
      attachment.attachmentType === "NEUTRAL_FIRM_INVOICE" &&
      document?.currentVersion?.mimeType !== "application/pdf"
    ) {
      throw new ApiError(
        400,
        "The neutral firm invoice must be a PDF document.",
      );
    }
  }
  return documents;
};

const validateRelatedTimesheets = async (
  caseId,
  relatedTimesheetIds,
  { invoiceId = null, db = prisma } = {},
) => {
  const ids = [...new Set((relatedTimesheetIds || []).filter(Boolean))];
  if (ids.length === 0) return;
  const validCount = await db.neutralTimesheet.count({
    where: {
      id: { in: ids },
      caseId,
      approvalStatus: TimesheetApprovalStatus.APPROVED,
    },
  });
  if (validCount !== ids.length) {
    throw new ApiError(
      400,
      "Every referenced timesheet must be approved and belong to this case.",
    );
  }
  const conflict = await db.invoiceLineItem.findFirst({
    where: {
      relatedTimesheetId: { in: ids },
      ...(invoiceId ? { invoiceId: { not: invoiceId } } : {}),
      invoice: { invoiceStatus: { not: InvoiceStatus.VOID } },
    },
    select: {
      relatedTimesheetId: true,
      invoice: { select: { invoiceNumber: true } },
    },
  });
  if (conflict) {
    throw new ApiError(
      409,
      `Timesheet ${conflict.relatedTimesheetId} is already attached to invoice ${conflict.invoice.invoiceNumber}.`,
    );
  }
};

const generateDraftInvoice = async (payload, currentUser) => {
  const {
    caseId,
    invoiceType,
    audience = "CLIENT",
    currency = "USD",
    billingInputSource: billingInputSourceOverride,
    payerCasePartyId,
    payerCasePartyIds,
    dueDate,
    invoiceDate,
    billingPeriodStart,
    billingPeriodEnd,
    firmInvoiceNumber,
    firmInvoiceDate,
    firmInvoiceAmount,
    firmExpensesAmount,
    clientBillingRef,
    taxRate = 0,
    notes,
    specialInstructions,
    timesheetIds = [],
    lineItems = [],
    attachments = [],
    amountDue: manualAmountDue,
  } = payload;

  await assertCanMutateCaseBilling(caseId, currentUser);
  await caseService.getCaseById(caseId, currentUser);

  const billingConfig =
    await billingRepository.findBillingConfigByCaseId(caseId);

  if (!isBillingConfigComplete(billingConfig)) {
    throw new ApiError(
      409,
      "Complete the case billing configuration, payer, and invoice contact before generating an invoice.",
    );
  }

  const inputSource =
    billingInputSourceOverride ||
    billingConfig?.billingInputSource ||
    BillingInputSource.FIRM_INVOICE;

  if (
    inputSource === BillingInputSource.FIRM_INVOICE &&
    timesheetIds.length > 0
  ) {
    throw new ApiError(
      400,
      "This case is configured for Firm Invoice billing. Platform timesheets cannot be used to generate invoices.",
    );
  }

  const hasFirmAmount =
    firmInvoiceAmount !== undefined &&
    firmInvoiceAmount !== null &&
    Number(firmInvoiceAmount) > 0;

  await validateInvoiceAttachmentDocuments(caseId, attachments);
  const invoiceAttachments = [...attachments];

  if (
    inputSource === BillingInputSource.FIRM_INVOICE &&
    invoiceType !== "DEPOSIT"
  ) {
    if (!firmInvoiceNumber || !firmInvoiceDate || !hasFirmAmount) {
      throw new ApiError(
        400,
        "Firm invoice number, date, and amount are required for Firm Invoice billing.",
      );
    }
    if (
      !invoiceAttachments.some(
        (attachment) => attachment.attachmentType === "NEUTRAL_FIRM_INVOICE",
      )
    ) {
      throw new ApiError(
        400,
        "Upload and attach the neutral firm's PDF invoice before generating the draft.",
      );
    }
  }

  if (
    inputSource === BillingInputSource.PLATFORM_TIMESHEETS &&
    timesheetIds.length === 0 &&
    (!lineItems || lineItems.length === 0) &&
    !hasFirmAmount &&
    invoiceType !== "DEPOSIT"
  ) {
    throw new ApiError(
      400,
      "This case is configured for Platform Timesheets. Provide approved timesheets or line items.",
    );
  }

  let payerTargets = [];
  if (Array.isArray(payerCasePartyIds) && payerCasePartyIds.length > 0) {
    payerTargets = payerCasePartyIds;
  } else if (payerCasePartyId) {
    payerTargets = [payerCasePartyId];
  } else if (
    Array.isArray(billingConfig.payerSplits) &&
    billingConfig.payerSplits.length > 0
  ) {
    payerTargets = billingConfig.payerSplits.map((row) => row.casePartyId);
  } else {
    payerTargets = [null];
  }

  if (billingConfig.payerSplits?.length > 0) {
    const allowed = new Set(
      billingConfig.payerSplits.map((row) => row.casePartyId),
    );
    for (const id of payerTargets) {
      if (id && !allowed.has(id)) {
        throw new ApiError(
          400,
          "Selected payer is not part of this case's billing configuration.",
        );
      }
    }
  }

  let preparedLineItems = [];
  const trackedHoursByBucket = { prePost: 0 };

  if (timesheetIds.length > 0) {
    const timesheets = await prisma.neutralTimesheet.findMany({
      where: {
        id: { in: timesheetIds },
        caseId,
        approvalStatus: TimesheetApprovalStatus.APPROVED,
      },
      include: {
        neutral: true,
        expenses: {
          include: {
            receipts: true,
          },
        },
        lineItems: {
          include: { invoice: true },
        },
      },
      orderBy: { entryDate: "asc" },
    });

    if (timesheets.length !== timesheetIds.length) {
      throw new ApiError(
        400,
        "One or more timesheets are invalid, unapproved, or not found.",
      );
    }

    const attachedDocumentIds = new Set(
      invoiceAttachments.map((attachment) => attachment.documentId),
    );
    for (const timesheet of timesheets) {
      for (const expense of timesheet.expenses || []) {
        for (const receipt of expense.receipts || []) {
          if (!attachedDocumentIds.has(receipt.documentId)) {
            invoiceAttachments.push({
              documentId: receipt.documentId,
              attachmentType: "EXPENSE_RECEIPTS",
              isSelected: true,
            });
            attachedDocumentIds.add(receipt.documentId);
          }
        }
      }
    }

    const expensesPolicy =
      billingConfig?.expensesPolicy || BillingExpensesPolicy.NOT_ALLOWED;
    const timesheetsWithExpenses = timesheets.filter(
      (ts) => (ts.expenses || []).length > 0,
    );
    if (
      timesheetsWithExpenses.length > 0 &&
      expensesPolicy === BillingExpensesPolicy.NOT_ALLOWED
    ) {
      throw new ApiError(
        400,
        "Selected timesheets include expenses, but expenses are not allowed for this case.",
      );
    }

    for (const ts of timesheets) {
      const activeItem = ts.lineItems.find(
        (li) => li.invoice?.invoiceStatus !== InvoiceStatus.VOID,
      );
      if (activeItem) {
        throw new ApiError(
          400,
          `Timesheet ${ts.id} is already attached to invoice ${activeItem.invoice?.invoiceNumber}`,
        );
      }

      const hours = Number(ts.hours);
      const rate = resolveTimesheetRate(
        ts.activityType,
        billingConfig,
        trackedHoursByBucket,
      );
      if (PRE_POST_ACTIVITY_TYPES.has(ts.activityType)) {
        trackedHoursByBucket.prePost += hours;
      }

      const itemAmount = roundMoney(hours * rate);
      const activityLabel = ts.activityType.replace(/_/g, " ");
      preparedLineItems.push({
        description: activityLabel,
        secondaryDescription:
          ts.billingNotes ||
          `${ts.neutral?.firstName || "Neutral"} ${ts.neutral?.lastName || ""}`.trim(),
        quantity: hours,
        unitPrice: rate,
        amount: itemAmount,
        serviceDate: ts.entryDate,
        referenceCode: `TS-${ts.id.slice(0, 8).toUpperCase()}`,
        sourceLabel: "Neutral Fee Schedule",
        relatedTimesheetId: ts.id,
      });

      if (
        expensesPolicy !== BillingExpensesPolicy.NOT_ALLOWED &&
        (ts.expenses || []).length > 0
      ) {
        for (const expense of ts.expenses) {
          const expAmount = roundMoney(Number(expense.amount));
          preparedLineItems.push({
            description: `Expense — ${String(expense.expenseType).replace(/_/g, " ")}`,
            secondaryDescription: expense.description || null,
            quantity: 1,
            unitPrice: expAmount,
            amount: expAmount,
            serviceDate: expense.expenseDate,
            referenceCode: `EX-${expense.id.slice(0, 8).toUpperCase()}`,
            sourceLabel: "Timesheet Expense",
            relatedTimesheetId: ts.id,
          });
        }
      }
    }
  }

  if (lineItems && lineItems.length > 0) {
    for (const item of lineItems) {
      const qty = Number(item.quantity || 1);
      const unitPrice = Number(item.unitPrice);
      const itemTotal =
        item.amount !== undefined
          ? Number(item.amount)
          : roundMoney(qty * unitPrice);
      preparedLineItems.push({
        description: item.description,
        secondaryDescription: emptyToNull(item.secondaryDescription),
        quantity: qty,
        unitPrice,
        amount: itemTotal,
        serviceDate: item.serviceDate ? new Date(item.serviceDate) : null,
        referenceCode: emptyToNull(item.referenceCode),
        sourceLabel: emptyToNull(item.sourceLabel) || "Manual Entry",
        relatedTimesheetId: item.relatedTimesheetId || null,
      });
    }
  }

  await validateInvoiceAttachmentDocuments(caseId, invoiceAttachments);

  if (
    hasFirmAmount &&
    preparedLineItems.length === 0 &&
    inputSource === BillingInputSource.FIRM_INVOICE
  ) {
    const firmAmt = Number(firmInvoiceAmount);
    preparedLineItems.push({
      description: "Neutral / Firm Invoice",
      secondaryDescription: firmInvoiceNumber
        ? `Firm invoice ${firmInvoiceNumber}`
        : null,
      quantity: 1,
      unitPrice: firmAmt,
      amount: firmAmt,
      serviceDate: firmInvoiceDate ? new Date(firmInvoiceDate) : null,
      referenceCode: firmInvoiceNumber || null,
      sourceLabel: "Firm Invoice",
      relatedTimesheetId: null,
    });
    if (firmExpensesAmount && Number(firmExpensesAmount) > 0) {
      const exp = Number(firmExpensesAmount);
      preparedLineItems.push({
        description: "Expenses",
        secondaryDescription: null,
        quantity: 1,
        unitPrice: exp,
        amount: exp,
        serviceDate: firmInvoiceDate ? new Date(firmInvoiceDate) : null,
        referenceCode: null,
        sourceLabel: "Firm Invoice",
        relatedTimesheetId: null,
      });
    }
  }

  let calculatedTotal = preparedLineItems.reduce(
    (acc, curr) => acc + curr.amount,
    0,
  );

  if (
    billingConfig?.setupFee &&
    invoiceType === "DEPOSIT" &&
    preparedLineItems.length === 0
  ) {
    const fee = Number(billingConfig.setupFee);
    preparedLineItems.push({
      description: "Initial Setup Fee",
      secondaryDescription: null,
      quantity: 1,
      unitPrice: fee,
      amount: fee,
      serviceDate: null,
      referenceCode: null,
      sourceLabel: "FedArb Fee Schedule",
      relatedTimesheetId: null,
    });
    calculatedTotal += fee;
  }

  if (
    billingConfig?.adminFeePercentage &&
    Number(billingConfig.adminFeePercentage) > 0 &&
    calculatedTotal > 0 &&
    invoiceType !== "REFUND"
  ) {
    const adminPct = Number(billingConfig.adminFeePercentage);
    const adminFeeAmount = roundMoney((calculatedTotal * adminPct) / 100);
    preparedLineItems.push({
      description: `Admin Fee (${adminPct}%)`,
      secondaryDescription: "FedArb client-side administration fee",
      quantity: 1,
      unitPrice: adminFeeAmount,
      amount: adminFeeAmount,
      serviceDate: null,
      referenceCode: null,
      sourceLabel: "FedArb Fee Schedule",
      relatedTimesheetId: null,
    });
    calculatedTotal = roundMoney(calculatedTotal + adminFeeAmount);
  } else if (
    billingConfig?.administrationFee &&
    Number(billingConfig.administrationFee) > 0 &&
    invoiceType === "ADMINISTRATIVE" &&
    preparedLineItems.length === 0
  ) {
    const fee = Number(billingConfig.administrationFee);
    preparedLineItems.push({
      description: "Administration Fee",
      secondaryDescription: null,
      quantity: 1,
      unitPrice: fee,
      amount: fee,
      serviceDate: null,
      referenceCode: null,
      sourceLabel: "FedArb Fee Schedule",
      relatedTimesheetId: null,
    });
    calculatedTotal += fee;
  }

  const taxRateNum = Number(taxRate || 0);
  if (manualAmountDue !== undefined) {
    const requestedTotal = roundMoney(Number(manualAmountDue));
    if (preparedLineItems.length > 0) {
      const calculatedAmountDue = roundMoney(
        calculatedTotal + (calculatedTotal * taxRateNum) / 100,
      );
      if (Math.abs(requestedTotal - calculatedAmountDue) > 0.01) {
        throw new ApiError(
          400,
          `amountDue must match the line-item and tax total of ${calculatedAmountDue.toFixed(2)}.`,
        );
      }
    } else {
      const manualSubtotal = roundMoney(
        requestedTotal / (1 + taxRateNum / 100),
      );
      preparedLineItems.push({
        description: "Manual invoice amount",
        secondaryDescription: null,
        quantity: 1,
        unitPrice: manualSubtotal,
        amount: manualSubtotal,
        serviceDate: null,
        referenceCode: null,
        sourceLabel: "Manual Entry",
        relatedTimesheetId: null,
      });
      calculatedTotal = manualSubtotal;
    }
  }
  const fullTotal = calculatedTotal;
  const relatedTimesheetIds = [
    ...timesheetIds,
    ...preparedLineItems.map((item) => item.relatedTimesheetId),
  ].filter(Boolean);
  await validateRelatedTimesheets(caseId, relatedTimesheetIds);

  const applySplits =
    billingConfig?.splitBillingEnabled &&
    billingConfig.payerSplits?.length > 0 &&
    payerTargets.every((id) => id);

  const residualId = billingConfig?.roundingResidualCasePartyId || null;

  return runInvoiceGenerationTransaction(
    async (tx) => {
      await validateRelatedTimesheets(caseId, relatedTimesheetIds, { db: tx });
      const batch = await tx.invoiceBatch.create({
        data: {
          caseId,
          invoiceType,
          billingInputSource: inputSource,
          billingPeriodStart: billingPeriodStart
            ? new Date(billingPeriodStart)
            : null,
          billingPeriodEnd: billingPeriodEnd
            ? new Date(billingPeriodEnd)
            : null,
          firmInvoiceNumber: emptyToNull(firmInvoiceNumber),
          firmInvoiceDate: firmInvoiceDate ? new Date(firmInvoiceDate) : null,
          firmInvoiceAmount:
            firmInvoiceAmount !== undefined && firmInvoiceAmount !== null
              ? Number(firmInvoiceAmount)
              : null,
          firmExpensesAmount:
            firmExpensesAmount !== undefined && firmExpensesAmount !== null
              ? Number(firmExpensesAmount)
              : null,
          notes: emptyToNull(notes) || emptyToNull(specialInstructions),
          createdByUserId: currentUser.id,
          attachments:
            invoiceAttachments.length > 0
              ? {
                  create: invoiceAttachments.map((att) => ({
                    documentId: att.documentId,
                    attachmentType: att.attachmentType,
                    isSelected: att.isSelected !== false,
                  })),
                }
              : undefined,
        },
        select: { id: true },
      });

      const invoiceNumbers = await generateInvoiceNumbers(
        tx,
        payerTargets.length,
      );
      const createdInvoices = [];
      const auditRows = [];
      const timelineRows = [];

      for (let i = 0; i < payerTargets.length; i += 1) {
        const targetPayerId = payerTargets[i];
        let payerLineItems = preparedLineItems;
        let subtotal = fullTotal;

        if (applySplits && targetPayerId) {
          const split = billingConfig.payerSplits.find(
            (row) => row.casePartyId === targetPayerId,
          );
          const splitPct = Number(split.splitPercentage);
          const scaled = scaleLineItemsForSplit(
            preparedLineItems,
            splitPct,
            residualId === targetPayerId,
            fullTotal,
          );
          payerLineItems = scaled.lineItems;
          subtotal = scaled.subtotal;
        }

        const taxAmount = roundMoney((subtotal * taxRateNum) / 100);
        const amountDue = roundMoney(subtotal + taxAmount);
        const invoiceNumber = invoiceNumbers[i];

        const invoice = await tx.invoice.create({
          data: {
            caseId,
            invoiceBatchId: batch.id,
            invoiceNumber,
            invoiceType,
            invoiceStatus: InvoiceStatus.DRAFT,
            paymentStatus: PaymentStatus.UNPAID,
            reviewStatus: InvoiceReviewStatus.NOT_SUBMITTED,
            audience,
            currency,
            payerCasePartyId: targetPayerId,
            invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
            billingInputSource: inputSource,
            billingPeriodStart: billingPeriodStart
              ? new Date(billingPeriodStart)
              : null,
            billingPeriodEnd: billingPeriodEnd
              ? new Date(billingPeriodEnd)
              : null,
            firmInvoiceNumber: emptyToNull(firmInvoiceNumber),
            firmInvoiceDate: firmInvoiceDate ? new Date(firmInvoiceDate) : null,
            firmInvoiceAmount:
              firmInvoiceAmount !== undefined && firmInvoiceAmount !== null
                ? Number(firmInvoiceAmount)
                : null,
            firmExpensesAmount:
              firmExpensesAmount !== undefined && firmExpensesAmount !== null
                ? Number(firmExpensesAmount)
                : null,
            clientBillingRef: emptyToNull(clientBillingRef),
            subtotal,
            taxRate: taxRateNum,
            taxAmount,
            amountDue,
            dueDate: dueDate ? new Date(dueDate) : null,
            specialInstructions:
              emptyToNull(specialInstructions) || emptyToNull(notes),
            lineItems: {
              create: payerLineItems,
            },
          },
          select: invoiceCreateSelect,
        });

        createdInvoices.push(invoice);
        auditRows.push({
          actingUserId: currentUser.id,
          actingUserRoleSnapshot: currentUser.role?.name || null,
          action: "GENERATE_DRAFT_INVOICE",
          module: "BILLING",
          affectedRecordType: "Invoice",
          affectedRecordId: invoice.id,
          newValue: {
            invoiceNumber,
            invoiceType,
            amountDue,
            invoiceBatchId: batch.id,
          },
        });
        timelineRows.push({
          caseId,
          eventType: CaseTimelineEventType.INVOICE_ISSUED,
          relatedRecordType: "Invoice",
          relatedRecordId: invoice.id,
          summary: `Draft invoice ${invoice.invoiceNumber} created for amount $${amountDue.toFixed(2)}`,
          actorUserId: currentUser.id,
          newValue: JSON.stringify({
            invoiceNumber,
            invoiceType,
            amountDue,
            invoiceBatchId: batch.id,
          }),
        });
      }

      if (auditRows.length > 0) {
        await tx.auditLog.createMany({ data: auditRows });
      }
      if (timelineRows.length > 0) {
        await tx.caseTimelineEvent.createMany({ data: timelineRows });
      }

      const fullBatch = await tx.invoiceBatch.findUnique({
        where: { id: batch.id },
        select: billingRepository.invoiceBatchSelect,
      });
      const fullInvoices = await billingRepository.findInvoicesByIds(
        (fullBatch.invoices || []).map((invoice) => invoice.id),
        tx,
      );
      const byId = new Map(
        fullInvoices.map((invoice) => [invoice.id, invoice]),
      );
      const canonicalInvoices = (fullBatch.invoices || []).map((invoice) =>
        buildCanonicalInvoice(byId.get(invoice.id), currentUser),
      );

      return {
        batch: fullBatch,
        batchId: fullBatch.id,
        primaryInvoiceId: canonicalInvoices[0]?.id || null,
        invoiceIds: canonicalInvoices.map((invoice) => invoice.id),
        invoices: canonicalInvoices,
        distribution: buildDistribution(createdInvoices, billingConfig),
      };
    },
    {
      maxWait: 15000,
      timeout: 30000,
      isolationLevel: "Serializable",
    },
  );
};

const getInvoiceById = async (invoiceId, currentUser) => {
  if (!isAuthorizedForBilling(currentUser)) {
    throw new ApiError(
      403,
      "You do not have permission to view invoice details.",
    );
  }
  const invoice = await billingRepository.findInvoiceById(invoiceId);
  if (!invoice) throw new ApiError(404, "Invoice not found.");
  await caseService.getCaseById(invoice.caseId, currentUser);

  let distribution = null;
  if (invoice.invoiceBatchId) {
    const batch = await billingRepository.findInvoiceBatchById(
      invoice.invoiceBatchId,
    );
    const billingConfig = await billingRepository.findBillingConfigByCaseId(
      invoice.caseId,
    );
    distribution = buildDistribution(batch?.invoices || [], billingConfig);
  }

  const history = await billingRepository.findInvoiceHistory(invoiceId);
  return {
    ...buildCanonicalInvoice(invoice, currentUser, { history }),
    distribution,
  };
};

const getInvoiceBatchById = async (batchId, currentUser) => {
  if (!isAuthorizedForBilling(currentUser)) {
    throw new ApiError(
      403,
      "You do not have permission to view invoice batches.",
    );
  }
  const batch = await billingRepository.findInvoiceBatchById(batchId);
  if (!batch) throw new ApiError(404, "Invoice batch not found.");
  await caseService.getCaseById(batch.caseId, currentUser);
  const billingConfig = await billingRepository.findBillingConfigByCaseId(
    batch.caseId,
  );
  const fullInvoices = await billingRepository.findInvoicesByIds(
    (batch.invoices || []).map((invoice) => invoice.id),
  );
  const byId = new Map(fullInvoices.map((invoice) => [invoice.id, invoice]));
  return {
    ...batch,
    invoices: (batch.invoices || []).map((invoice) =>
      buildCanonicalInvoice(byId.get(invoice.id), currentUser),
    ),
    distribution: buildDistribution(batch.invoices || [], billingConfig),
  };
};

const updateInvoice = async (invoiceId, payload, currentUser) => {
  const existing = await billingRepository.findInvoiceById(invoiceId);
  if (!existing) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(existing.caseId, currentUser);
  if (existing.invoiceStatus !== InvoiceStatus.DRAFT) {
    throw new ApiError(400, "Only draft invoices can be edited.");
  }
  if (
    [InvoiceReviewStatus.PENDING_REVIEW, InvoiceReviewStatus.APPROVED].includes(
      existing.reviewStatus,
    )
  ) {
    throw new ApiError(
      409,
      "This invoice is locked by its review state and cannot be edited.",
    );
  }
  if (payload.expectedVersion !== existing.version) {
    throw new ApiError(
      409,
      "This invoice was updated by another user. Refresh it before saving.",
    );
  }

  if (payload.attachments) {
    if (!existing.invoiceBatchId) {
      throw new ApiError(400, "Invoice attachments require an invoice batch.");
    }
    await validateInvoiceAttachmentDocuments(
      existing.caseId,
      payload.attachments,
    );
    if (
      existing.billingInputSource === BillingInputSource.FIRM_INVOICE &&
      existing.invoiceType !== "DEPOSIT" &&
      !payload.attachments.some(
        (attachment) => attachment.attachmentType === "NEUTRAL_FIRM_INVOICE",
      )
    ) {
      throw new ApiError(
        400,
        "The neutral firm's PDF invoice is required for Firm Invoice billing.",
      );
    }
  }

  if (payload.payerCasePartyId !== undefined) {
    if (!payload.payerCasePartyId) {
      throw new ApiError(400, "A payer is required for an invoice.");
    }
    const [party, billingConfig] = await Promise.all([
      billingRepository.findCasePartyIds(existing.caseId, [
        payload.payerCasePartyId,
      ]),
      billingRepository.findBillingConfigByCaseId(existing.caseId),
    ]);
    if (party.length !== 1) {
      throw new ApiError(400, "Selected payer does not belong to this case.");
    }
    if (
      billingConfig?.payerSplits?.length &&
      !billingConfig.payerSplits.some(
        (split) => split.casePartyId === payload.payerCasePartyId,
      )
    ) {
      throw new ApiError(
        400,
        "Selected payer is not part of this case's billing configuration.",
      );
    }
  }

  const relatedTimesheetIds = (payload.lineItems || [])
    .map((item) => item.relatedTimesheetId)
    .filter(Boolean);
  await validateRelatedTimesheets(existing.caseId, relatedTimesheetIds, {
    invoiceId,
  });

  return runTransaction(
    async (tx) => {
      await validateRelatedTimesheets(existing.caseId, relatedTimesheetIds, {
        invoiceId,
        db: tx,
      });
      let finalAmount =
        payload.amountDue !== undefined
          ? Number(payload.amountDue)
          : Number(existing.amountDue);
      let lineItemsSubtotal = Number(existing.subtotal || 0);

      if (payload.lineItems) {
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId } });
        const createdItems = payload.lineItems.map((item) => {
          const qty = Number(item.quantity || 1);
          const unitPrice = Number(item.unitPrice);
          const amount =
            item.amount !== undefined
              ? Number(item.amount)
              : Math.round(qty * unitPrice * 100) / 100;
          return {
            invoiceId,
            description: item.description,
            secondaryDescription: emptyToNull(item.secondaryDescription),
            quantity: qty,
            unitPrice,
            amount,
            serviceDate: item.serviceDate ? new Date(item.serviceDate) : null,
            referenceCode: emptyToNull(item.referenceCode),
            sourceLabel: emptyToNull(item.sourceLabel) || "Manual Entry",
            relatedTimesheetId: item.relatedTimesheetId || null,
          };
        });
        await tx.invoiceLineItem.createMany({ data: createdItems });
        lineItemsSubtotal = roundMoney(
          createdItems.reduce((acc, curr) => acc + curr.amount, 0),
        );
        if (payload.amountDue === undefined) {
          finalAmount = lineItemsSubtotal;
        }
      }

      const subtotal = payload.lineItems
        ? lineItemsSubtotal
        : Number(existing.subtotal || 0);
      const taxRate =
        payload.taxRate !== undefined
          ? Number(payload.taxRate || 0)
          : Number(existing.taxRate || 0);
      const taxAmount = roundMoney((subtotal * taxRate) / 100);
      const calculatedAmountDue = roundMoney(subtotal + taxAmount);
      if (
        payload.amountDue !== undefined &&
        Math.abs(finalAmount - calculatedAmountDue) > 0.01
      ) {
        throw new ApiError(
          400,
          `amountDue must match the line-item and tax total of ${calculatedAmountDue.toFixed(2)}.`,
        );
      }
      if (
        payload.amountDue === undefined &&
        (payload.lineItems || payload.taxRate !== undefined)
      ) {
        finalAmount = calculatedAmountDue;
      }

      const result = await tx.invoice.updateMany({
        where: {
          id: invoiceId,
          version: payload.expectedVersion,
          invoiceStatus: InvoiceStatus.DRAFT,
          reviewStatus: {
            in: [
              InvoiceReviewStatus.NOT_SUBMITTED,
              InvoiceReviewStatus.CHANGES_REQUESTED,
            ],
          },
        },
        data: {
          ...(payload.payerCasePartyId !== undefined && {
            payerCasePartyId: payload.payerCasePartyId,
          }),
          ...(payload.dueDate !== undefined && {
            dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
          }),
          ...(payload.invoiceDate !== undefined && {
            invoiceDate: payload.invoiceDate
              ? new Date(payload.invoiceDate)
              : existing.invoiceDate,
          }),
          ...(payload.billingPeriodStart !== undefined && {
            billingPeriodStart: payload.billingPeriodStart
              ? new Date(payload.billingPeriodStart)
              : null,
          }),
          ...(payload.billingPeriodEnd !== undefined && {
            billingPeriodEnd: payload.billingPeriodEnd
              ? new Date(payload.billingPeriodEnd)
              : null,
          }),
          ...(payload.firmInvoiceNumber !== undefined && {
            firmInvoiceNumber: emptyToNull(payload.firmInvoiceNumber),
          }),
          ...(payload.firmInvoiceDate !== undefined && {
            firmInvoiceDate: payload.firmInvoiceDate
              ? new Date(payload.firmInvoiceDate)
              : null,
          }),
          ...(payload.firmInvoiceAmount !== undefined && {
            firmInvoiceAmount: payload.firmInvoiceAmount,
          }),
          ...(payload.firmExpensesAmount !== undefined && {
            firmExpensesAmount: payload.firmExpensesAmount,
          }),
          ...(payload.clientBillingRef !== undefined && {
            clientBillingRef: emptyToNull(payload.clientBillingRef),
          }),
          ...(payload.specialInstructions !== undefined && {
            specialInstructions: payload.specialInstructions,
          }),
          ...(payload.lineItems && { subtotal }),
          ...(payload.taxRate !== undefined && { taxRate }),
          ...((payload.lineItems || payload.taxRate !== undefined) && {
            taxAmount,
          }),
          amountDue: finalAmount,
          reviewStatus:
            existing.reviewStatus === InvoiceReviewStatus.CHANGES_REQUESTED
              ? InvoiceReviewStatus.NOT_SUBMITTED
              : existing.reviewStatus,
          ...(existing.reviewStatus ===
            InvoiceReviewStatus.CHANGES_REQUESTED && {
            reviewDecisionNotes: null,
            reviewedAt: null,
            reviewedByUserId: null,
          }),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ApiError(
          409,
          "This invoice changed while it was being saved. Refresh it before retrying.",
        );
      }

      if (payload.attachments) {
        await billingRepository.replaceInvoiceBatchAttachments(
          existing.invoiceBatchId,
          payload.attachments,
          tx,
        );
      }
      if (payload.notes !== undefined && existing.invoiceBatchId) {
        await tx.invoiceBatch.update({
          where: { id: existing.invoiceBatchId },
          data: { notes: emptyToNull(payload.notes) },
        });
      }

      const updated = await billingRepository.findInvoiceById(invoiceId, tx);
      await tx.auditLog.create({
        data: {
          actingUserId: currentUser.id,
          actingUserRoleSnapshot: currentUser.role?.name || null,
          action: "UPDATE_DRAFT_INVOICE",
          module: "BILLING",
          affectedRecordType: "Invoice",
          affectedRecordId: invoiceId,
          previousValue: JSON.parse(JSON.stringify(existing)),
          newValue: JSON.parse(JSON.stringify(updated)),
        },
      });

      return buildCanonicalInvoice(updated, currentUser);
    },
    { isolationLevel: "Serializable" },
  );
};

const submitInvoiceForReview = async (invoiceId, payload, currentUser) => {
  const existing = await billingRepository.findInvoiceById(invoiceId);
  if (!existing) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(existing.caseId, currentUser);
  if (existing.invoiceStatus !== InvoiceStatus.DRAFT) {
    throw new ApiError(400, "Only draft invoices can be submitted for review.");
  }
  if (
    ![
      InvoiceReviewStatus.NOT_SUBMITTED,
      InvoiceReviewStatus.CHANGES_REQUESTED,
    ].includes(existing.reviewStatus)
  ) {
    throw new ApiError(409, "Invoice is already pending review or approved.");
  }

  return runTransaction(async (tx) => {
    const result = await tx.invoice.updateMany({
      where: {
        id: invoiceId,
        version: existing.version,
        invoiceStatus: InvoiceStatus.DRAFT,
        reviewStatus: {
          in: [
            InvoiceReviewStatus.NOT_SUBMITTED,
            InvoiceReviewStatus.CHANGES_REQUESTED,
          ],
        },
      },
      data: {
        reviewStatus: InvoiceReviewStatus.PENDING_REVIEW,
        reviewNotes: emptyToNull(payload.reviewNotes),
        reviewDecisionNotes: null,
        submittedForReviewAt: new Date(),
        submittedForReviewByUserId: currentUser.id,
        reviewedAt: null,
        reviewedByUserId: null,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new ApiError(
        409,
        "This invoice changed while it was submitted. Refresh and try again.",
      );
    }
    const updated = await billingRepository.findInvoiceById(invoiceId, tx);

    await tx.auditLog.create({
      data: {
        actingUserId: currentUser.id,
        actingUserRoleSnapshot: currentUser.role?.name || null,
        action: "SUBMIT_INVOICE_FOR_REVIEW",
        module: "BILLING",
        affectedRecordType: "Invoice",
        affectedRecordId: invoiceId,
        newValue: {
          submittedBy: currentUser.id,
          reviewNotes: payload.reviewNotes || null,
        },
      },
    });

    await tx.caseTimelineEvent.create({
      data: {
        caseId: existing.caseId,
        eventType: CaseTimelineEventType.STATUS_CHANGED,
        relatedRecordType: "Invoice",
        relatedRecordId: invoiceId,
        summary: `Invoice ${existing.invoiceNumber} submitted for Peer/Controller Review`,
        actorUserId: currentUser.id,
      },
    });

    return buildCanonicalInvoice(updated, currentUser);
  });
};

const reviewInvoice = async (invoiceId, payload, currentUser) => {
  const existing = await billingRepository.findInvoiceById(invoiceId);
  if (!existing) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(existing.caseId, currentUser);
  if (existing.invoiceStatus !== InvoiceStatus.DRAFT) {
    throw new ApiError(400, "Only draft invoices can be reviewed.");
  }
  if (existing.reviewStatus !== InvoiceReviewStatus.PENDING_REVIEW) {
    throw new ApiError(409, "Invoice is not pending review.");
  }
  if (existing.submittedForReviewByUserId === currentUser.id) {
    throw new ApiError(
      409,
      "The invoice submitter cannot review their own invoice.",
    );
  }

  const reviewStatus =
    payload.decision === "APPROVE"
      ? InvoiceReviewStatus.APPROVED
      : InvoiceReviewStatus.CHANGES_REQUESTED;

  return runTransaction(async (tx) => {
    const result = await tx.invoice.updateMany({
      where: {
        id: invoiceId,
        version: existing.version,
        invoiceStatus: InvoiceStatus.DRAFT,
        reviewStatus: InvoiceReviewStatus.PENDING_REVIEW,
      },
      data: {
        reviewStatus,
        reviewDecisionNotes: emptyToNull(payload.notes),
        reviewedAt: new Date(),
        reviewedByUserId: currentUser.id,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new ApiError(
        409,
        "This invoice review was already decided or changed. Refresh and try again.",
      );
    }
    const updated = await billingRepository.findInvoiceById(invoiceId, tx);
    await tx.auditLog.create({
      data: {
        actingUserId: currentUser.id,
        actingUserRoleSnapshot: currentUser.role?.name || null,
        action:
          reviewStatus === InvoiceReviewStatus.APPROVED
            ? "APPROVE_INVOICE_REVIEW"
            : "REQUEST_INVOICE_CHANGES",
        module: "BILLING",
        affectedRecordType: "Invoice",
        affectedRecordId: invoiceId,
        reason: payload.notes || null,
        previousValue: { reviewStatus: existing.reviewStatus },
        newValue: { reviewStatus },
      },
    });
    return buildCanonicalInvoice(updated, currentUser);
  });
};

const finalizeInvoice = async (invoiceId, currentUser) => {
  const existing = await billingRepository.findInvoiceById(invoiceId);
  if (!existing) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(existing.caseId, currentUser);
  if (existing.invoiceStatus !== InvoiceStatus.DRAFT) {
    throw new ApiError(400, "Invoice is not in draft status.");
  }
  if (existing.reviewStatus !== InvoiceReviewStatus.APPROVED) {
    throw new ApiError(
      409,
      "Invoice must be approved through review before it can be finalized.",
    );
  }

  return runTransaction(async (tx) => {
    const result = await tx.invoice.updateMany({
      where: {
        id: invoiceId,
        version: existing.version,
        invoiceStatus: InvoiceStatus.DRAFT,
        reviewStatus: InvoiceReviewStatus.APPROVED,
      },
      data: {
        invoiceStatus: InvoiceStatus.ISSUED,
        finalizedAt: new Date(),
        finalizedByUserId: currentUser.id,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new ApiError(
        409,
        "This invoice changed while it was finalized. Refresh and try again.",
      );
    }
    const updated = await billingRepository.findInvoiceById(invoiceId, tx);

    await tx.auditLog.create({
      data: {
        actingUserId: currentUser.id,
        actingUserRoleSnapshot: currentUser.role?.name || null,
        action: "FINALIZE_INVOICE",
        module: "BILLING",
        affectedRecordType: "Invoice",
        affectedRecordId: invoiceId,
        previousValue: { invoiceStatus: existing.invoiceStatus },
        newValue: { invoiceStatus: InvoiceStatus.ISSUED },
      },
    });

    await tx.caseTimelineEvent.create({
      data: {
        caseId: existing.caseId,
        eventType: CaseTimelineEventType.INVOICE_ISSUED,
        relatedRecordType: "Invoice",
        relatedRecordId: invoiceId,
        summary: `Invoice ${existing.invoiceNumber} finalized`,
        actorUserId: currentUser.id,
      },
    });

    return buildCanonicalInvoice(updated, currentUser);
  });
};

const finalizeInvoiceBatch = async (batchId, currentUser) => {
  const batch = await billingRepository.findInvoiceBatchById(batchId);
  if (!batch) throw new ApiError(404, "Invoice batch not found.");
  await assertCanMutateCaseBilling(batch.caseId, currentUser);

  const draftInvoices = (batch.invoices || []).filter(
    (inv) => inv.invoiceStatus === InvoiceStatus.DRAFT,
  );
  if (draftInvoices.length === 0) {
    throw new ApiError(
      400,
      "No draft invoices found in this batch to finalize.",
    );
  }
  const unapproved = draftInvoices.filter(
    (invoice) => invoice.reviewStatus !== InvoiceReviewStatus.APPROVED,
  );
  if (unapproved.length > 0) {
    throw new ApiError(
      409,
      "Every draft invoice in the batch must be approved through review before finalization.",
    );
  }

  const finalized = await runTransaction(async (tx) => {
    const ids = draftInvoices.map((invoice) => invoice.id);
    const result = await tx.invoice.updateMany({
      where: {
        id: { in: ids },
        invoiceStatus: InvoiceStatus.DRAFT,
        reviewStatus: InvoiceReviewStatus.APPROVED,
      },
      data: {
        invoiceStatus: InvoiceStatus.ISSUED,
        finalizedAt: new Date(),
        finalizedByUserId: currentUser.id,
        version: { increment: 1 },
      },
    });
    if (result.count !== ids.length) {
      throw new ApiError(
        409,
        "The invoice batch changed during finalization. Refresh and try again.",
      );
    }
    await tx.auditLog.createMany({
      data: draftInvoices.map((invoice) => ({
        actingUserId: currentUser.id,
        actingUserRoleSnapshot: currentUser.role?.name || null,
        action: "FINALIZE_INVOICE",
        module: "BILLING",
        affectedRecordType: "Invoice",
        affectedRecordId: invoice.id,
        previousValue: { invoiceStatus: invoice.invoiceStatus },
        newValue: { invoiceStatus: InvoiceStatus.ISSUED },
      })),
    });
    await tx.caseTimelineEvent.createMany({
      data: draftInvoices.map((invoice) => ({
        caseId: batch.caseId,
        eventType: CaseTimelineEventType.INVOICE_ISSUED,
        relatedRecordType: "Invoice",
        relatedRecordId: invoice.id,
        summary: `Invoice ${invoice.invoiceNumber} finalized`,
        actorUserId: currentUser.id,
      })),
    });
    const updated = await billingRepository.findInvoicesByIds(ids, tx);
    const byId = new Map(updated.map((invoice) => [invoice.id, invoice]));
    return ids.map((id) => buildCanonicalInvoice(byId.get(id), currentUser));
  });

  const refreshed = await billingRepository.findInvoiceBatchById(batchId);
  const billingConfig = await billingRepository.findBillingConfigByCaseId(
    batch.caseId,
  );
  return {
    ...refreshed,
    distribution: buildDistribution(refreshed.invoices || [], billingConfig),
    finalizedInvoices: finalized,
  };
};

const sendInvoice = async (invoiceId, payload, currentUser) => {
  const invoice = await billingRepository.findInvoiceById(invoiceId);
  if (!invoice) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(invoice.caseId, currentUser);
  if (
    ![InvoiceStatus.ISSUED, InvoiceStatus.SENT, InvoiceStatus.OVERDUE].includes(
      invoice.invoiceStatus,
    )
  ) {
    throw new ApiError(
      400,
      "Only finalized invoices can be sent to payer contacts.",
    );
  }

  const {
    recipientEmails,
    subject,
    message,
    attachPdf = false,
    attachmentIds = [],
  } = payload;
  const emailSubject =
    subject || `Invoice ${invoice.invoiceNumber} from FedArb ADR`;
  const emailBody =
    message ||
    `Please find invoice ${invoice.invoiceNumber} for Case ${invoice.case?.caseNumber || ""}. Total Due: $${Number(invoice.amountDue).toFixed(2)}.`;

  const emailAttachments = [];
  if (attachPdf) {
    const invoicePdfService = require("./invoicePdf.service");
    const { buffer, filename } = await invoicePdfService.generateInvoicePdf(
      invoiceId,
      currentUser,
    );
    emailAttachments.push({
      filename,
      content: buffer,
      contentType: "application/pdf",
    });
  }

  if (attachmentIds.length > 0) {
    if (!invoice.invoiceBatchId) {
      throw new ApiError(
        400,
        "This invoice does not have supporting attachments.",
      );
    }
    const selectedAttachments =
      await billingRepository.findInvoiceAttachmentsByIds(
        invoice.invoiceBatchId,
        attachmentIds,
      );
    if (selectedAttachments.length !== attachmentIds.length) {
      throw new ApiError(
        400,
        "One or more selected attachments do not belong to this invoice.",
      );
    }
    const supportingSize = selectedAttachments.reduce(
      (sum, attachment) =>
        sum + Number(attachment.document?.currentVersion?.fileSizeBytes || 0),
      0,
    );
    if (supportingSize > 20 * 1024 * 1024) {
      throw new ApiError(
        400,
        "Selected supporting attachments exceed the 20 MB delivery limit.",
      );
    }
    const supportingAttachments = await Promise.all(
      selectedAttachments.map(async (attachment) => ({
        filename: attachment.document.name,
        content: await getObjectBuffer(
          attachment.document.currentVersion.fileKey,
        ),
        contentType:
          attachment.document.currentVersion.mimeType ||
          "application/octet-stream",
      })),
    );
    emailAttachments.push(...supportingAttachments);
  }

  for (const recipient of recipientEmails) {
    await sendEmail(
      emailSubject,
      emailBody,
      recipient,
      "TEXT",
      emailAttachments,
    );
  }

  return runTransaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        invoiceStatus: InvoiceStatus.SENT,
        sentAt: new Date(),
        version: { increment: 1 },
      },
      select: billingRepository.invoiceSelect,
    });

    await tx.auditLog.create({
      data: {
        actingUserId: currentUser.id,
        actingUserRoleSnapshot: currentUser.role?.name || null,
        action: "SEND_INVOICE",
        module: "BILLING",
        affectedRecordType: "Invoice",
        affectedRecordId: invoiceId,
        newValue: {
          recipients: recipientEmails,
          attachPdf: Boolean(attachPdf),
          attachmentIds,
          sentAt: new Date().toISOString(),
        },
      },
    });

    return {
      ...buildCanonicalInvoice(updated, currentUser),
      delivery: {
        recipients: recipientEmails,
        attachPdf: Boolean(attachPdf),
        attachmentIds,
      },
    };
  });
};

const voidInvoice = async (invoiceId, reason, currentUser) => {
  const existing = await billingRepository.findInvoiceById(invoiceId);
  if (!existing) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(existing.caseId, currentUser);
  if (
    ![InvoiceStatus.ISSUED, InvoiceStatus.SENT, InvoiceStatus.OVERDUE].includes(
      existing.invoiceStatus,
    )
  ) {
    throw new ApiError(400, "Only finalized invoices can be voided.");
  }
  if ((existing.payments || []).length || (existing.creditNotes || []).length) {
    throw new ApiError(
      409,
      "Invoices with payments or credit notes cannot be voided. Reverse those entries first.",
    );
  }

  return runTransaction(async (tx) => {
    const result = await tx.invoice.updateMany({
      where: {
        id: invoiceId,
        version: existing.version,
        invoiceStatus: {
          in: [InvoiceStatus.ISSUED, InvoiceStatus.SENT, InvoiceStatus.OVERDUE],
        },
        payments: { none: {} },
        creditNotes: { none: {} },
      },
      data: {
        invoiceStatus: InvoiceStatus.VOID,
        voidedAt: new Date(),
        voidReason: reason,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new ApiError(
        409,
        "This invoice changed or received a financial entry before it could be voided.",
      );
    }
    const updated = await billingRepository.findInvoiceById(invoiceId, tx);

    await tx.auditLog.create({
      data: {
        actingUserId: currentUser.id,
        actingUserRoleSnapshot: currentUser.role?.name || null,
        action: "VOID_INVOICE",
        module: "BILLING",
        affectedRecordType: "Invoice",
        affectedRecordId: invoiceId,
        reason,
        previousValue: { invoiceStatus: existing.invoiceStatus },
        newValue: { invoiceStatus: InvoiceStatus.VOID },
      },
    });

    return buildCanonicalInvoice(updated, currentUser);
  });
};

const reissueInvoice = async (invoiceId, payload, currentUser) => {
  const existing = await billingRepository.findInvoiceById(invoiceId);
  if (!existing) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(existing.caseId, currentUser);
  if (existing.invoiceStatus !== InvoiceStatus.VOID) {
    throw new ApiError(400, "Only void invoices can be reissued.");
  }
  const sourceAttachments = (existing.invoiceBatch?.attachments || []).map(
    (attachment) => ({
      documentId: attachment.documentId,
      attachmentType: attachment.attachmentType,
      isSelected: attachment.isSelected,
    }),
  );
  await validateInvoiceAttachmentDocuments(existing.caseId, sourceAttachments);

  try {
    return await runTransaction(async (tx) => {
      const newNumber = await generateInvoiceNumber(tx);
      const lineItemsData = existing.lineItems.map((li) => ({
        description: li.description,
        secondaryDescription: li.secondaryDescription,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        amount: li.amount,
        serviceDate: li.serviceDate,
        referenceCode: li.referenceCode,
        sourceLabel: li.sourceLabel,
        relatedTimesheetId: li.relatedTimesheetId,
      }));

      const sourceBatch = existing.invoiceBatch;
      const reissuedBatch = await tx.invoiceBatch.create({
        data: {
          caseId: existing.caseId,
          invoiceType: existing.invoiceType,
          billingInputSource: existing.billingInputSource,
          billingPeriodStart: existing.billingPeriodStart,
          billingPeriodEnd: existing.billingPeriodEnd,
          firmInvoiceNumber: existing.firmInvoiceNumber,
          firmInvoiceDate: existing.firmInvoiceDate,
          firmInvoiceAmount: existing.firmInvoiceAmount,
          firmExpensesAmount: existing.firmExpensesAmount,
          notes: sourceBatch?.notes || null,
          createdByUserId: currentUser.id,
          attachments: sourceBatch?.attachments?.length
            ? {
                create: sourceBatch.attachments.map((attachment) => ({
                  documentId: attachment.documentId,
                  attachmentType: attachment.attachmentType,
                  isSelected: attachment.isSelected,
                })),
              }
            : undefined,
        },
        select: { id: true },
      });

      const reissued = await tx.invoice.create({
        data: {
          caseId: existing.caseId,
          invoiceBatchId: reissuedBatch.id,
          invoiceNumber: newNumber,
          invoiceType: existing.invoiceType,
          invoiceStatus: InvoiceStatus.DRAFT,
          paymentStatus: PaymentStatus.UNPAID,
          reviewStatus: InvoiceReviewStatus.NOT_SUBMITTED,
          audience: existing.audience,
          currency: existing.currency,
          payerCasePartyId: existing.payerCasePartyId,
          invoiceDate: new Date(),
          billingInputSource: existing.billingInputSource,
          billingPeriodStart: existing.billingPeriodStart,
          billingPeriodEnd: existing.billingPeriodEnd,
          firmInvoiceNumber: existing.firmInvoiceNumber,
          firmInvoiceDate: existing.firmInvoiceDate,
          firmInvoiceAmount: existing.firmInvoiceAmount,
          firmExpensesAmount: existing.firmExpensesAmount,
          clientBillingRef: existing.clientBillingRef,
          subtotal: existing.subtotal,
          taxRate: existing.taxRate,
          taxAmount: existing.taxAmount,
          amountDue: existing.amountDue,
          dueDate: payload.dueDate
            ? new Date(payload.dueDate)
            : existing.dueDate,
          reissuedFromInvoiceId: existing.id,
          specialInstructions:
            payload.specialInstructions ||
            `Reissued from voided invoice ${existing.invoiceNumber}. Reason: ${payload.reason}`,
          lineItems: {
            create: lineItemsData,
          },
        },
        select: billingRepository.invoiceSelect,
      });

      await tx.auditLog.create({
        data: {
          actingUserId: currentUser.id,
          actingUserRoleSnapshot: currentUser.role?.name || null,
          action: "REISSUE_INVOICE",
          module: "BILLING",
          affectedRecordType: "Invoice",
          affectedRecordId: reissued.id,
          reason: payload.reason,
          previousValue: {
            previousInvoiceId: existing.id,
            previousInvoiceNumber: existing.invoiceNumber,
          },
          newValue: JSON.parse(JSON.stringify(reissued)),
        },
      });

      return buildCanonicalInvoice(reissued, currentUser);
    });
  } catch (error) {
    if (
      error?.code === "P2002" &&
      String(error?.meta?.target || "").includes("reissuedFromInvoiceId")
    ) {
      throw new ApiError(
        409,
        "This void invoice has already been reissued. Refresh the invoice list.",
      );
    }
    throw error;
  }
};

const getInvoicesList = async (query, currentUser) => {
  if (!isAuthorizedForBilling(currentUser)) {
    throw new ApiError(403, "You do not have permission to view invoices.");
  }
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  let where = applyBillingCaseFilter({}, currentUser);

  if (query.search) {
    where.OR = [
      { invoiceNumber: { contains: query.search, mode: "insensitive" } },
      { case: { caseNumber: { contains: query.search, mode: "insensitive" } } },
      { case: { title: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  await assertCaseAccessIfProvided(query.caseId, currentUser);
  if (query.caseId) where.caseId = query.caseId;
  if (query.invoiceStatus) where.invoiceStatus = query.invoiceStatus;
  if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
  if (query.invoiceType) where.invoiceType = query.invoiceType;
  if (query.reviewStatus) where.reviewStatus = query.reviewStatus;
  if (query.audience) where.audience = query.audience;
  if (query.payerCasePartyId) where.payerCasePartyId = query.payerCasePartyId;
  if (query.caseNumber) {
    where.case = {
      ...(where.case || {}),
      caseNumber: { contains: query.caseNumber, mode: "insensitive" },
    };
  }
  if (query.quickBooksSyncStatus)
    where.quickBooksSyncStatus = query.quickBooksSyncStatus;

  if (query.fromDate || query.toDate) {
    where.invoiceDate = {
      ...(query.fromDate && { gte: new Date(query.fromDate) }),
      ...(query.toDate && { lte: endOfUtcDay(query.toDate) }),
    };
  }
  if (query.invoiceDateFrom || query.invoiceDateTo) {
    where.invoiceDate = {
      ...(query.invoiceDateFrom && { gte: new Date(query.invoiceDateFrom) }),
      ...(query.invoiceDateTo && { lte: endOfUtcDay(query.invoiceDateTo) }),
    };
  }
  if (query.dueDateFrom || query.dueDateTo) {
    where.dueDate = {
      ...(query.dueDateFrom && { gte: new Date(query.dueDateFrom) }),
      ...(query.dueDateTo && { lte: endOfUtcDay(query.dueDateTo) }),
    };
  }

  const { invoices, total } = await billingRepository.getInvoices({
    where,
    skip,
    take: limit,
    orderBy: [
      {
        [query.sortBy || "createdAt"]:
          query.sortOrder === "asc" ? "asc" : "desc",
      },
      { id: "asc" },
    ],
  });

  const now = new Date();
  const enriched = invoices.map((invoice) =>
    buildCanonicalInvoice(invoice, currentUser, { now }),
  );

  return paginate(enriched, total, page, limit, "invoices");
};

const recordPayment = async (invoiceId, payload, currentUser) => {
  const invoice = await billingRepository.findInvoiceById(invoiceId);
  if (!invoice) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(invoice.caseId, currentUser);
  if (
    ![InvoiceStatus.ISSUED, InvoiceStatus.SENT, InvoiceStatus.OVERDUE].includes(
      invoice.invoiceStatus,
    )
  ) {
    throw new ApiError(
      400,
      "Payments can only be recorded on finalized invoices.",
    );
  }

  const paymentAmount = Number(payload.amount);
  return runTransaction(
    async (tx) => {
      const currentInvoice = await billingRepository.findInvoiceById(
        invoiceId,
        tx,
      );
      const balances = computeInvoiceBalances(currentInvoice);
      if (paymentAmount > balances.openBalance) {
        throw new ApiError(
          409,
          `Payment amount exceeds the open balance of ${balances.openBalance.toFixed(2)}.`,
        );
      }
      const newPaymentStatus =
        roundMoney(paymentAmount) >= balances.openBalance
          ? PaymentStatus.PAID
          : PaymentStatus.PARTIAL;
      const nextInvoiceStatus =
        newPaymentStatus === PaymentStatus.PAID &&
        currentInvoice.invoiceStatus === InvoiceStatus.OVERDUE
          ? InvoiceStatus.SENT
          : balances.overdue &&
              [InvoiceStatus.ISSUED, InvoiceStatus.SENT].includes(
                currentInvoice.invoiceStatus,
              )
            ? InvoiceStatus.OVERDUE
            : currentInvoice.invoiceStatus;
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          amount: paymentAmount,
          paymentDate: new Date(payload.paymentDate),
          method: payload.method || null,
          referenceNumber: emptyToNull(payload.referenceNumber) || null,
          notes: emptyToNull(payload.notes) || null,
        },
      });

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paymentStatus: newPaymentStatus,
          invoiceStatus: nextInvoiceStatus,
          version: { increment: 1 },
        },
        select: billingRepository.invoiceSelect,
      });

      await tx.auditLog.create({
        data: {
          actingUserId: currentUser.id,
          actingUserRoleSnapshot: currentUser.role?.name || null,
          action: "RECORD_PAYMENT",
          module: "BILLING",
          affectedRecordType: "Payment",
          affectedRecordId: payment.id,
          newValue: JSON.parse(JSON.stringify(payment)),
        },
      });

      await tx.caseTimelineEvent.create({
        data: {
          caseId: invoice.caseId,
          eventType: CaseTimelineEventType.PAYMENT_RECEIVED,
          relatedRecordType: "Payment",
          relatedRecordId: payment.id,
          summary: `Payment of $${paymentAmount.toFixed(2)} recorded for invoice ${invoice.invoiceNumber}`,
          actorUserId: currentUser.id,
        },
      });

      return {
        ...payment,
        invoice: buildCanonicalInvoice(updatedInvoice, currentUser),
      };
    },
    { isolationLevel: "Serializable" },
  );
};

const recordCreditNote = async (invoiceId, payload, currentUser) => {
  const invoice = await billingRepository.findInvoiceById(invoiceId);
  if (!invoice) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(invoice.caseId, currentUser);
  if (
    ![InvoiceStatus.ISSUED, InvoiceStatus.SENT, InvoiceStatus.OVERDUE].includes(
      invoice.invoiceStatus,
    )
  ) {
    throw new ApiError(
      400,
      "Credit notes can only be recorded on finalized invoices.",
    );
  }

  const creditAmount = Number(payload.amount);
  return runTransaction(
    async (tx) => {
      const currentInvoice = await billingRepository.findInvoiceById(
        invoiceId,
        tx,
      );
      const balances = computeInvoiceBalances(currentInvoice);
      if (creditAmount > balances.openBalance) {
        throw new ApiError(
          409,
          `Credit amount exceeds the open balance of ${balances.openBalance.toFixed(2)}.`,
        );
      }
      const newPaymentStatus =
        roundMoney(creditAmount) >= balances.openBalance
          ? PaymentStatus.PAID
          : PaymentStatus.PARTIAL;
      const nextInvoiceStatus =
        newPaymentStatus === PaymentStatus.PAID &&
        currentInvoice.invoiceStatus === InvoiceStatus.OVERDUE
          ? InvoiceStatus.SENT
          : balances.overdue &&
              [InvoiceStatus.ISSUED, InvoiceStatus.SENT].includes(
                currentInvoice.invoiceStatus,
              )
            ? InvoiceStatus.OVERDUE
            : currentInvoice.invoiceStatus;
      const creditNote = await tx.creditNote.create({
        data: {
          invoiceId,
          amount: creditAmount,
          reason: payload.reason,
          issuedAt: new Date(payload.issuedAt),
        },
      });

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paymentStatus: newPaymentStatus,
          invoiceStatus: nextInvoiceStatus,
          version: { increment: 1 },
        },
        select: billingRepository.invoiceSelect,
      });

      await tx.auditLog.create({
        data: {
          actingUserId: currentUser.id,
          actingUserRoleSnapshot: currentUser.role?.name || null,
          action: "RECORD_CREDIT_NOTE",
          module: "BILLING",
          affectedRecordType: "CreditNote",
          affectedRecordId: creditNote.id,
          reason: payload.reason,
          newValue: JSON.parse(JSON.stringify(creditNote)),
        },
      });

      return {
        ...creditNote,
        invoice: buildCanonicalInvoice(updatedInvoice, currentUser),
      };
    },
    { isolationLevel: "Serializable" },
  );
};

const getPaymentTracking = async (query, currentUser) => {
  if (!isAuthorizedForBilling(currentUser)) {
    throw new ApiError(
      403,
      "You do not have permission to view payment tracking.",
    );
  }
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const caseScope = buildBillingCaseScope(currentUser);
  let where = {
    invoiceStatus: {
      in: [InvoiceStatus.ISSUED, InvoiceStatus.SENT, InvoiceStatus.OVERDUE],
    },
  };

  if (Object.keys(caseScope).length > 0) {
    where.case = caseScope;
  }

  await assertCaseAccessIfProvided(query.caseId, currentUser);
  if (query.caseId) where.caseId = query.caseId;
  if (query.invoiceId) {
    await getInvoiceById(query.invoiceId, currentUser);
    where.id = query.invoiceId;
  }
  if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
  if (query.invoiceStatus) where.invoiceStatus = query.invoiceStatus;

  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const daysAgo = (days) =>
    new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  if (query.overdueOnly === true || query.overdueOnly === "true") {
    where.dueDate = { lt: today };
    where.paymentStatus = { not: PaymentStatus.PAID };
  }
  if (query.agingBucket) {
    const ranges = {
      current: { gte: today },
      "1-30": { lt: today, gte: daysAgo(30) },
      "31-60": { lt: daysAgo(30), gte: daysAgo(60) },
      "61-90": { lt: daysAgo(60), gte: daysAgo(90) },
      "90+": { lt: daysAgo(90) },
    };
    where.dueDate = ranges[query.agingBucket];
    where.paymentStatus = { not: PaymentStatus.PAID };
  }

  if (query.search) {
    where.OR = [
      { invoiceNumber: { contains: query.search, mode: "insensitive" } },
      { case: { caseNumber: { contains: query.search, mode: "insensitive" } } },
      { case: { title: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  if (query.fromDate || query.toDate) {
    where.invoiceDate = {
      ...(query.fromDate && { gte: new Date(query.fromDate) }),
      ...(query.toDate && { lte: endOfUtcDay(query.toDate) }),
    };
  }

  const { invoices, total } = await billingRepository.getInvoices({
    where,
    skip,
    take: limit,
    orderBy: [
      {
        [query.sortBy === "paymentDate"
          ? "dueDate"
          : query.sortBy === "amount"
            ? "amountDue"
            : query.sortBy || "dueDate"]:
          query.sortOrder === "asc" ? "asc" : "desc",
      },
      { id: "asc" },
    ],
  });

  const rows = invoices.map((invoice) => {
    const balances = computeInvoiceBalances(invoice, now);
    const canonical = buildCanonicalInvoice(invoice, currentUser, { now });
    return {
      ...canonical,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      caseId: invoice.caseId,
      caseNumber: invoice.case?.caseNumber || null,
      matterName: invoice.case?.title || null,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      amountDue: balances.amountDue,
      amountPaid: balances.amountPaid,
      amountCredited: balances.amountCredited,
      openBalance: balances.openBalance,
      outstanding: balances.openBalance,
      paymentStatus: invoice.paymentStatus,
      invoiceStatus: invoice.invoiceStatus,
      overdue: balances.overdue,
      agingBucket: balances.agingBucket,
      quickBooksSyncStatus: invoice.quickBooksSyncStatus,
      qbStatus: invoice.quickBooksSyncStatus,
      payments: invoice.payments || [],
      lastPaymentAt: invoice.payments?.[0]?.paymentDate || null,
    };
  });

  const agingWhere = {
    invoiceStatus: {
      in: [InvoiceStatus.ISSUED, InvoiceStatus.SENT, InvoiceStatus.OVERDUE],
    },
    paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL] },
    ...(Object.keys(caseScope).length > 0 ? { case: caseScope } : {}),
    ...(query.caseId ? { caseId: query.caseId } : {}),
  };

  const allInvoices = await prisma.invoice.findMany({
    where: agingWhere,
    include: {
      payments: true,
      creditNotes: true,
    },
  });

  const aging = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    days90Plus: 0,
    totalOutstanding: 0,
  };

  for (const inv of allInvoices) {
    const balances = computeInvoiceBalances(inv, now);
    if (balances.openBalance <= 0) continue;
    aging.totalOutstanding += balances.openBalance;
    const bucket = balances.agingBucket;
    if (bucket === "current") {
      aging.current += balances.openBalance;
    } else if (bucket === "1-30") {
      aging.days1to30 += balances.openBalance;
    } else if (bucket === "31-60") {
      aging.days31to60 += balances.openBalance;
    } else if (bucket === "61-90") {
      aging.days61to90 += balances.openBalance;
    } else {
      aging.days90Plus += balances.openBalance;
    }
  }

  return {
    ...paginate(rows, total, page, limit, "invoices"),
    payments: rows,
    agingSummary: {
      current: Number(aging.current.toFixed(2)),
      days1to30: Number(aging.days1to30.toFixed(2)),
      days31to60: Number(aging.days31to60.toFixed(2)),
      days61to90: Number(aging.days61to90.toFixed(2)),
      days90Plus: Number(aging.days90Plus.toFixed(2)),
      totalOutstanding: Number(aging.totalOutstanding.toFixed(2)),
    },
  };
};

const updateInvoicePaymentStatus = async (invoiceId, payload, currentUser) => {
  const invoice = await billingRepository.findInvoiceById(invoiceId);
  if (!invoice) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(invoice.caseId, currentUser);
  if (
    ![InvoiceStatus.ISSUED, InvoiceStatus.SENT, InvoiceStatus.OVERDUE].includes(
      invoice.invoiceStatus,
    )
  ) {
    throw new ApiError(
      400,
      "Payment status can only be updated on finalized invoices.",
    );
  }

  const paymentStatus = payload.paymentStatus;
  if (
    ![PaymentStatus.UNPAID, PaymentStatus.PARTIAL, PaymentStatus.PAID].includes(
      paymentStatus,
    )
  ) {
    throw new ApiError(400, "Invalid payment status.");
  }

  const balances = computeInvoiceBalances(invoice);
  const invoiceStatusUpdate = {};
  if (
    balances.overdue &&
    paymentStatus !== PaymentStatus.PAID &&
    [InvoiceStatus.ISSUED, InvoiceStatus.SENT].includes(invoice.invoiceStatus)
  ) {
    invoiceStatusUpdate.invoiceStatus = InvoiceStatus.OVERDUE;
  } else if (
    paymentStatus === PaymentStatus.PAID &&
    invoice.invoiceStatus === InvoiceStatus.OVERDUE
  ) {
    invoiceStatusUpdate.invoiceStatus = InvoiceStatus.SENT;
  }

  return runTransaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paymentStatus,
        ...invoiceStatusUpdate,
        version: { increment: 1 },
      },
      select: billingRepository.invoiceSelect,
    });

    await tx.auditLog.create({
      data: {
        actingUserId: currentUser.id,
        actingUserRoleSnapshot: currentUser.role?.name || null,
        action: "UPDATE_INVOICE_PAYMENT_STATUS",
        module: "BILLING",
        affectedRecordType: "Invoice",
        affectedRecordId: invoiceId,
        reason: payload.notes || null,
        previousValue: { paymentStatus: invoice.paymentStatus },
        newValue: { paymentStatus, notes: payload.notes || null },
      },
    });

    return buildCanonicalInvoice(updated, currentUser);
  });
};

const syncInvoiceToQuickBooks = async (invoiceId, currentUser) => {
  if (!["SUPER_ADMIN", "ACCOUNTING_STAFF"].includes(currentUser?.role?.name)) {
    throw new ApiError(
      403,
      "Only accounting staff can manage QuickBooks synchronization.",
    );
  }
  const invoice = await billingRepository.findInvoiceById(invoiceId);
  if (!invoice) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(invoice.caseId, currentUser);
  throw new ApiError(
    501,
    "QuickBooks transport is not configured. No invoice state was changed.",
  );
};

const getQuickBooksSyncLogs = async (query, currentUser) => {
  if (!isAuthorizedForBilling(currentUser)) {
    throw new ApiError(
      403,
      "You are not authorized to view QuickBooks sync logs.",
    );
  }

  const { status, relatedRecordType, fromDate, toDate } = query;

  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const where = {
    integrationType: IntegrationType.QUICKBOOKS,
    ...(status && { status }),
    ...(relatedRecordType && { relatedRecordType }),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate && { gte: new Date(fromDate) }),
            ...(toDate && { lte: endOfUtcDay(toDate) }),
          },
        }
      : {}),
  };

  const caseScope = buildBillingCaseScope(currentUser);
  if (
    Object.keys(caseScope).length > 0 ||
    query.caseId ||
    query.payerCasePartyId ||
    query.search
  ) {
    if (relatedRecordType && relatedRecordType !== "Invoice") {
      return paginate([], 0, page, limit, "syncLogs");
    }

    const accessibleInvoices = await prisma.invoice.findMany({
      where: {
        ...(Object.keys(caseScope).length > 0 ? { case: caseScope } : {}),
        ...(query.caseId ? { caseId: query.caseId } : {}),
        ...(query.payerCasePartyId
          ? { payerCasePartyId: query.payerCasePartyId }
          : {}),
        ...(query.search
          ? {
              OR: [
                {
                  invoiceNumber: {
                    contains: query.search,
                    mode: "insensitive",
                  },
                },
                {
                  case: {
                    caseNumber: {
                      contains: query.search,
                      mode: "insensitive",
                    },
                  },
                },
                {
                  case: {
                    title: { contains: query.search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      select: { id: true },
    });
    const invoiceIds = accessibleInvoices.map((invoice) => invoice.id);

    if (invoiceIds.length === 0) {
      return paginate([], 0, page, limit, "syncLogs");
    }

    where.relatedRecordType = "Invoice";
    where.relatedRecordId = { in: invoiceIds };
  }

  const { logs, total } = await billingRepository.findIntegrationSyncLogs({
    where,
    skip,
    take: limit,
    orderBy: { createdAt: "desc" },
  });
  const invoiceIds = logs
    .filter((log) => log.relatedRecordType === "Invoice")
    .map((log) => log.relatedRecordId);
  const invoices = await billingRepository.findInvoicesByIds(invoiceIds);
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const enrichedLogs = logs.map((log) => {
    const invoice = invoiceById.get(log.relatedRecordId);
    return {
      ...log,
      recordReference: invoice?.invoiceNumber || log.relatedRecordId,
      invoice: invoice
        ? {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            invoiceStatus: invoice.invoiceStatus,
            caseId: invoice.caseId,
            caseNumber: invoice.case?.caseNumber || null,
            matterName: invoice.case?.title || null,
            payer: partyDisplayName(invoice.payerCaseParty),
            amountDue: Number(invoice.amountDue),
            quickBooks: {
              status: invoice.quickBooksSyncStatus,
              referenceId: invoice.quickBooksInvoiceId,
              lastSyncedAt: invoice.quickBooksLastSyncedAt,
            },
          }
        : null,
    };
  });

  return paginate(enrichedLogs, total, page, limit, "syncLogs");
};

const retryQuickBooksSync = async (data, currentUser) => {
  const roleName = currentUser?.role?.name;
  if (!["SUPER_ADMIN", "ACCOUNTING_STAFF"].includes(roleName)) {
    throw new ApiError(
      403,
      "You are not authorized to retry QuickBooks sync tasks.",
    );
  }

  void data;
  throw new ApiError(
    501,
    "QuickBooks transport is not configured. No sync logs were changed.",
  );
};

const generateNeutralPaymentStatement = async (caseId, data, currentUser) => {
  await assertCanMutateCaseBilling(caseId, currentUser);
  await caseService.getCaseById(caseId, currentUser);

  const billingConfig =
    await billingRepository.findBillingConfigByCaseId(caseId);
  const timesheets = await billingRepository.findTimesheetsByIds(
    data.timesheetIds,
  );
  if (timesheets.length !== data.timesheetIds.length) {
    throw new ApiError(400, "One or more selected timesheets do not exist.");
  }
  for (const ts of timesheets) {
    if (ts.caseId !== caseId) {
      throw new ApiError(
        400,
        "All timesheets must belong to the selected case.",
      );
    }
  }

  const trackedHoursByBucket = { prePost: 0 };
  let totalServicesAmount = 0;
  let totalExpensesAmount = 0;

  const items = timesheets
    .slice()
    .sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate))
    .map((ts) => {
      const hours = Number(ts.hours);
      const rate = resolveTimesheetRate(
        ts.activityType,
        billingConfig,
        trackedHoursByBucket,
      );
      if (PRE_POST_ACTIVITY_TYPES.has(ts.activityType)) {
        trackedHoursByBucket.prePost += hours;
      }
      const amount = roundMoney(hours * rate);
      totalServicesAmount += amount;
      return {
        timesheetId: ts.id,
        date: ts.entryDate,
        activityType: ts.activityType,
        hours: roundMoney(hours),
        hourlyRate: rate,
        totalAmount: amount,
      };
    });

  const agreementFeeDefault = billingConfig?.agreementFeePercentage
    ? Number(billingConfig.agreementFeePercentage)
    : 15.0;
  const adminFeePercentage = Number(
    data.adminFeePercentage ?? agreementFeeDefault,
  );
  const adminFeeDeduction = roundMoney(
    (totalServicesAmount * adminFeePercentage) / 100,
  );
  const netPayable = roundMoney(
    totalServicesAmount - adminFeeDeduction + totalExpensesAmount,
  );

  return {
    caseId,
    statementDate: data.statementDate || new Date().toISOString(),
    neutralParticipantId: data.neutralParticipantId || null,
    totalServicesAmount: roundMoney(totalServicesAmount),
    adminFeePercentage,
    agreementFeePercentage: billingConfig?.agreementFeePercentage
      ? Number(billingConfig.agreementFeePercentage)
      : null,
    adminFeeDeduction,
    totalExpensesAmount: roundMoney(totalExpensesAmount),
    netPayable,
    items,
    notes: data.notes || null,
  };
};

module.exports = {
  getCaseBillingConfig,
  createCaseBillingConfig,
  updateCaseBillingConfig,
  upsertCaseBillingConfig,
  getBillingConfigurationsList,
  getApprovedTimesheets,
  generateDraftInvoice,
  getInvoiceById,
  getInvoiceBatchById,
  updateInvoice,
  submitInvoiceForReview,
  reviewInvoice,
  finalizeInvoice,
  finalizeInvoiceBatch,
  sendInvoice,
  voidInvoice,
  reissueInvoice,
  getInvoicesList,
  recordPayment,
  recordCreditNote,
  getPaymentTracking,
  updateInvoicePaymentStatus,
  syncInvoiceToQuickBooks,
  getQuickBooksSyncLogs,
  retryQuickBooksSync,
  generateNeutralPaymentStatement,
};
