const prisma = require("../config/prisma");
const { runTransaction } = require("../config/prisma");
const billingRepository = require("../repositories/billing.repository");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");
const { sendEmail } = require("../utils/sendEmail");
const { PRE_POST_ACTIVITY_TYPES } = require("../constants/billing.constants");
const {
  InvoiceStatus,
  PaymentStatus,
  TimesheetApprovalStatus,
  IntegrationSyncStatus,
  IntegrationType,
  CaseTimelineEventType,
  BillingInputSource,
  BillingExpensesPolicy,
} = require("@prisma/client");

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
    const participant = await prisma.caseParticipant.findFirst({
      where: {
        caseId,
        userId: currentUser.id,
        role: "CASE_MANAGER",
        accessStatus: "ACTIVE",
      },
      select: { id: true },
    });
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

const getCaseBillingConfig = async (caseId, currentUser) => {
  if (!isAuthorizedForBilling(currentUser)) {
    throw new ApiError(
      403,
      "You do not have permission to view billing configuration.",
    );
  }
  await caseService.getCaseById(caseId, currentUser);
  const config = await billingRepository.findBillingConfigByCaseId(caseId);
  return {
    caseId,
    configuration: config,
    status: config ? "CONFIGURED" : "INCOMPLETE",
  };
};

const validatePayerSplitsForCase = async (caseId, payload) => {
  const {
    splitBillingEnabled,
    payerSplits,
    roundingResidualCasePartyId,
  } = payload;

  if (!splitBillingEnabled && payerSplits === undefined) {
    return;
  }

  const splits = payerSplits || [];
  if (splitBillingEnabled && splits.length === 0) {
    throw new ApiError(
      400,
      "At least one payer split is required when split billing is enabled.",
    );
  }

  if (splits.length === 0) {
    return;
  }

  const partyIds = [...new Set(splits.map((row) => row.casePartyId))];
  if (partyIds.length !== splits.length) {
    throw new ApiError(400, "Duplicate payers are not allowed in split billing.");
  }

  const parties = await prisma.caseParty.findMany({
    where: { caseId, id: { in: partyIds } },
    select: { id: true },
  });
  if (parties.length !== partyIds.length) {
    throw new ApiError(400, "One or more payer parties do not belong to this case.");
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

const upsertCaseBillingConfig = async (caseId, payload, currentUser) => {
  await assertCanMutateCaseBilling(caseId, currentUser);
  await caseService.getCaseById(caseId, currentUser);

  await validatePayerSplitsForCase(caseId, payload);
  const {
    payerSplits,
    additionalTimekeepers,
    ...rest
  } = payload;

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
    const previous = await tx.billingConfiguration.findUnique({
      where: { caseId },
      select: billingRepository.billingConfigSelect,
    });
    const saved = await billingRepository.upsertBillingConfig(
      caseId,
      {
        scalarData,
        payerSplits: normalizedPayerSplits,
        additionalTimekeepers: normalizedTimekeepers,
      },
      tx,
    );

    await tx.auditLog.create({
      data: {
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
    });

    return saved;
  });
};

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

  const caseWhere = {};
  const caseScopeConditions = [];
  const caseScope = buildBillingCaseScope(currentUser);
  if (Object.keys(caseScope).length > 0) {
    caseScopeConditions.push(caseScope);
  }

  if (query.search) {
    caseWhere.OR = [
      { caseNumber: { contains: query.search, mode: "insensitive" } },
      { title: { contains: query.search, mode: "insensitive" } },
    ];
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
  if (query.payerPartyId) {
    caseWhere.parties = {
      some: { id: query.payerPartyId },
    };
  }

  const billingConfigurationFilter = {};
  if (query.status === "CONFIGURED") {
    caseWhere.billingConfiguration = { isNot: null };
  } else if (query.status === "INCOMPLETE") {
    caseWhere.billingConfiguration = null;
  }

  if (query.billingType) {
    billingConfigurationFilter.billingType = query.billingType;
  }
  if (query.billingInputSource) {
    billingConfigurationFilter.billingInputSource = query.billingInputSource;
  }
  if (query.billingMode) {
    billingConfigurationFilter.billingMode = query.billingMode;
  }

  if (Object.keys(billingConfigurationFilter).length > 0) {
    if (query.status === "INCOMPLETE") {
      // INCOMPLETE means no config; type/source filters cannot apply.
      caseWhere.billingConfiguration = null;
    } else {
      caseWhere.billingConfiguration = {
        ...(typeof caseWhere.billingConfiguration === "object" &&
        caseWhere.billingConfiguration &&
        !("isNot" in caseWhere.billingConfiguration)
          ? caseWhere.billingConfiguration
          : {}),
        ...billingConfigurationFilter,
      };
    }
  }

  const { cases, total } = await billingRepository.getCasesWithOrWithoutBilling(
    {
      where: caseWhere,
      skip,
      take: limit,
      orderBy: { createdAt: query.sortOrder === "asc" ? "asc" : "desc" },
    },
  );

  const enrichedCases = cases.map((c) => ({
    caseId: c.id,
    caseNumber: c.caseNumber,
    title: c.title,
    caseType: c.caseType,
    lifecycleStatus: c.lifecycleStatus,
    parties: c.parties,
    neutrals: c.participants.map((p) => p.user),
    configuration: c.billingConfiguration,
    status: c.billingConfiguration ? "CONFIGURED" : "INCOMPLETE",
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));

  return paginate(enrichedCases, total, page, limit, "configurations");
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
  if (query.neutralUserId) where.neutralUserId = query.neutralUserId;
  if (query.activityType) where.activityType = query.activityType;

  if (query.fromDate || query.toDate) {
    where.entryDate = {
      ...(query.fromDate && { gte: new Date(query.fromDate) }),
      ...(query.toDate && { lte: new Date(query.toDate) }),
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
    return {
      ...ts,
      expensesTotal: (ts.expenses || []).reduce(
        (sum, row) => sum + Number(row.amount || 0),
        0,
      ),
      associationStatus,
      activeInvoice,
    };
  });

  return paginate(formatted, total, page, limit, "timesheets");
};

const resolveTimesheetRate = (activityType, billingConfig, trackedHoursByBucket) => {
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

const generateDraftInvoice = async (payload, currentUser) => {
  const {
    caseId,
    invoiceType,
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
    billingConfig?.splitBillingEnabled &&
    Array.isArray(billingConfig.payerSplits) &&
    billingConfig.payerSplits.length > 0
  ) {
    payerTargets = billingConfig.payerSplits.map((row) => row.casePartyId);
  } else {
    payerTargets = [null];
  }

  if (
    billingConfig?.splitBillingEnabled &&
    billingConfig.payerSplits?.length > 0
  ) {
    const allowed = new Set(
      billingConfig.payerSplits.map((row) => row.casePartyId),
    );
    for (const id of payerTargets) {
      if (id && !allowed.has(id)) {
        throw new ApiError(
          400,
          "Selected payer is not part of this case's billing split configuration.",
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
        expenses: true,
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

  const fullTotal =
    manualAmountDue !== undefined ? Number(manualAmountDue) : calculatedTotal;
  const taxRateNum = Number(taxRate || 0);

  const applySplits =
    billingConfig?.splitBillingEnabled &&
    billingConfig.payerSplits?.length > 0 &&
    payerTargets.every((id) => id) &&
    manualAmountDue === undefined;

  const residualId = billingConfig?.roundingResidualCasePartyId || null;

  return runTransaction(
    async (tx) => {
    const batch = await tx.invoiceBatch.create({
      data: {
        caseId,
        invoiceType,
        billingInputSource: inputSource,
        billingPeriodStart: billingPeriodStart
          ? new Date(billingPeriodStart)
          : null,
        billingPeriodEnd: billingPeriodEnd ? new Date(billingPeriodEnd) : null,
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
          attachments.length > 0
            ? {
                create: attachments.map((att) => ({
                  documentId: att.documentId,
                  attachmentType: att.attachmentType,
                  isSelected: att.isSelected !== false,
                })),
              }
            : undefined,
      },
      select: { id: true },
    });

    const invoiceNumbers = await generateInvoiceNumbers(tx, payerTargets.length);
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

    return {
      batch: fullBatch,
      invoices: createdInvoices,
      distribution: buildDistribution(createdInvoices, billingConfig),
    };
    },
    {
      maxWait: 15000,
      timeout: 30000,
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
    const billingConfig =
      await billingRepository.findBillingConfigByCaseId(invoice.caseId);
    distribution = buildDistribution(batch?.invoices || [], billingConfig);
  }

  return { ...invoice, distribution };
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
  return {
    ...batch,
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

  return runTransaction(async (tx) => {
    let finalAmount =
      payload.amountDue !== undefined
        ? Number(payload.amountDue)
        : Number(existing.amountDue);

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
          quantity: qty,
          unitPrice,
          amount,
          relatedTimesheetId: item.relatedTimesheetId || null,
        };
      });
      await tx.invoiceLineItem.createMany({ data: createdItems });
      if (payload.amountDue === undefined) {
        finalAmount = createdItems.reduce((acc, curr) => acc + curr.amount, 0);
      }
    }

    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        ...(payload.payerCasePartyId !== undefined && {
          payerCasePartyId: payload.payerCasePartyId,
        }),
        ...(payload.dueDate !== undefined && {
          dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        }),
        ...(payload.specialInstructions !== undefined && {
          specialInstructions: payload.specialInstructions,
        }),
        amountDue: finalAmount,
      },
      select: billingRepository.invoiceSelect,
    });

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

    return updated;
  });
};

const submitInvoiceForReview = async (invoiceId, payload, currentUser) => {
  const existing = await billingRepository.findInvoiceById(invoiceId);
  if (!existing) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(existing.caseId, currentUser);
  if (existing.invoiceStatus !== InvoiceStatus.DRAFT) {
    throw new ApiError(400, "Only draft invoices can be submitted for review.");
  }

  return runTransaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        specialInstructions: payload.reviewNotes
          ? `${existing.specialInstructions ? `${existing.specialInstructions}\n\n` : ""}[Review Note]: ${payload.reviewNotes}`
          : existing.specialInstructions,
      },
      select: billingRepository.invoiceSelect,
    });

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
          reviewerUserId: payload.reviewerUserId || null,
          reviewNotes: payload.reviewNotes || null,
        },
      },
    });

    await tx.caseTimelineEvent.create({
      data: {
        caseId: existing.caseId,
        eventType: CaseTimelineEventType.DOCUMENT_VISIBILITY_CHANGED,
        relatedRecordType: "Invoice",
        relatedRecordId: invoiceId,
        summary: `Invoice ${existing.invoiceNumber} submitted for Peer/Controller Review`,
        actorUserId: currentUser.id,
      },
    });

    return updated;
  });
};

const finalizeInvoice = async (invoiceId, currentUser) => {
  const existing = await billingRepository.findInvoiceById(invoiceId);
  if (!existing) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(existing.caseId, currentUser);
  if (existing.invoiceStatus !== InvoiceStatus.DRAFT) {
    throw new ApiError(400, "Invoice is not in draft status.");
  }

  return runTransaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        invoiceStatus: InvoiceStatus.ISSUED,
        finalizedAt: new Date(),
        finalizedByUserId: currentUser.id,
      },
      select: billingRepository.invoiceSelect,
    });

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

    return updated;
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
    throw new ApiError(400, "No draft invoices found in this batch to finalize.");
  }

  const finalized = [];
  for (const inv of draftInvoices) {
    finalized.push(await finalizeInvoice(inv.id, currentUser));
  }

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

  const { recipientEmails, subject, message, attachPdf = false } = payload;
  const emailSubject =
    subject || `Invoice ${invoice.invoiceNumber} from FedArb ADR`;
  const emailBody =
    message ||
    `Please find invoice ${invoice.invoiceNumber} for Case ${invoice.case?.caseNumber || ""}. Total Due: $${Number(invoice.amountDue).toFixed(2)}.`;

  let pdfAttachment = null;
  if (attachPdf) {
    const invoicePdfService = require("./invoicePdf.service");
    const { buffer, filename } = await invoicePdfService.generateInvoicePdf(
      invoiceId,
      currentUser,
    );
    pdfAttachment = {
      filename,
      content: buffer,
      contentType: "application/pdf",
    };
  }

  for (const recipient of recipientEmails) {
    await sendEmail(
      emailSubject,
      emailBody,
      recipient,
      "TEXT",
      pdfAttachment ? [pdfAttachment] : [],
    );
  }

  return runTransaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        invoiceStatus: InvoiceStatus.SENT,
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
          sentAt: new Date().toISOString(),
        },
      },
    });

    return updated;
  });
};

const voidInvoice = async (invoiceId, reason, currentUser) => {
  const existing = await billingRepository.findInvoiceById(invoiceId);
  if (!existing) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(existing.caseId, currentUser);
  if (existing.invoiceStatus === InvoiceStatus.VOID) {
    throw new ApiError(400, "Invoice is already void.");
  }

  return runTransaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        invoiceStatus: InvoiceStatus.VOID,
        specialInstructions: existing.specialInstructions
          ? `${existing.specialInstructions}\n[VOID REASON: ${reason}]`
          : `[VOID REASON: ${reason}]`,
      },
      select: billingRepository.invoiceSelect,
    });

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

    return updated;
  });
};

const reissueInvoice = async (invoiceId, payload, currentUser) => {
  const existing = await billingRepository.findInvoiceById(invoiceId);
  if (!existing) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(existing.caseId, currentUser);
  if (existing.invoiceStatus !== InvoiceStatus.VOID) {
    throw new ApiError(400, "Only void invoices can be reissued.");
  }

  return runTransaction(async (tx) => {
    const newNumber = await generateInvoiceNumber(tx);
    const lineItemsData = existing.lineItems.map((li) => ({
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      amount: li.amount,
      relatedTimesheetId: li.relatedTimesheetId,
    }));

    const reissued = await tx.invoice.create({
      data: {
        caseId: existing.caseId,
        invoiceNumber: newNumber,
        invoiceType: existing.invoiceType,
        invoiceStatus: InvoiceStatus.DRAFT,
        paymentStatus: PaymentStatus.UNPAID,
        payerCasePartyId: existing.payerCasePartyId,
        amountDue: existing.amountDue,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : existing.dueDate,
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

    return reissued;
  });
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
  if (query.payerCasePartyId) where.payerCasePartyId = query.payerCasePartyId;
  if (query.quickBooksSyncStatus)
    where.quickBooksSyncStatus = query.quickBooksSyncStatus;

  if (query.fromDate || query.toDate) {
    where.createdAt = {
      ...(query.fromDate && { gte: new Date(query.fromDate) }),
      ...(query.toDate && { lte: new Date(query.toDate) }),
    };
  }

  const { invoices, total } = await billingRepository.getInvoices({
    where,
    skip,
    take: limit,
    orderBy: {
      [query.sortBy || "createdAt"]: query.sortOrder === "asc" ? "asc" : "desc",
    },
  });

  return paginate(invoices, total, page, limit, "invoices");
};

const recordPayment = async (invoiceId, payload, currentUser) => {
  const invoice = await billingRepository.findInvoiceById(invoiceId);
  if (!invoice) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(invoice.caseId, currentUser);
  if (invoice.invoiceStatus === InvoiceStatus.VOID) {
    throw new ApiError(400, "Cannot record payment on a void invoice.");
  }

  const paymentAmount = Number(payload.amount);
  const totalPaidBefore = invoice.payments.reduce(
    (acc, curr) => acc + Number(curr.amount),
    0,
  );
  const totalCreditBefore = invoice.creditNotes.reduce(
    (acc, curr) => acc + Number(curr.amount),
    0,
  );
  const totalDue = Number(invoice.amountDue);
  const newTotalSettled = totalPaidBefore + totalCreditBefore + paymentAmount;

  let newPaymentStatus = PaymentStatus.PARTIAL;
  if (newTotalSettled >= totalDue) {
    newPaymentStatus = PaymentStatus.PAID;
  }

  return runTransaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        invoiceId,
        amount: paymentAmount,
        paymentDate: new Date(payload.paymentDate),
        method: payload.method || null,
      },
    });

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paymentStatus: newPaymentStatus,
      },
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

    return payment;
  });
};

const recordCreditNote = async (invoiceId, payload, currentUser) => {
  const invoice = await billingRepository.findInvoiceById(invoiceId);
  if (!invoice) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(invoice.caseId, currentUser);
  if (invoice.invoiceStatus === InvoiceStatus.VOID) {
    throw new ApiError(400, "Cannot record credit note on a void invoice.");
  }

  const creditAmount = Number(payload.amount);
  const totalPaidBefore = invoice.payments.reduce(
    (acc, curr) => acc + Number(curr.amount),
    0,
  );
  const totalCreditBefore = invoice.creditNotes.reduce(
    (acc, curr) => acc + Number(curr.amount),
    0,
  );
  const totalDue = Number(invoice.amountDue);
  const newTotalSettled = totalPaidBefore + totalCreditBefore + creditAmount;

  let newPaymentStatus = invoice.paymentStatus;
  if (newTotalSettled >= totalDue) {
    newPaymentStatus = PaymentStatus.PAID;
  } else if (newTotalSettled > 0) {
    newPaymentStatus = PaymentStatus.PARTIAL;
  }

  return runTransaction(async (tx) => {
    const creditNote = await tx.creditNote.create({
      data: {
        invoiceId,
        amount: creditAmount,
        reason: payload.reason,
        issuedAt: new Date(payload.issuedAt),
      },
    });

    if (newPaymentStatus !== invoice.paymentStatus) {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { paymentStatus: newPaymentStatus },
      });
    }

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

    return creditNote;
  });
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
  const where = {};

  if (Object.keys(caseScope).length > 0) {
    where.invoice = { case: caseScope };
  }

  await assertCaseAccessIfProvided(query.caseId, currentUser);
  if (query.caseId) {
    where.invoice = { ...(where.invoice || {}), caseId: query.caseId };
  }
  if (query.invoiceId) {
    await getInvoiceById(query.invoiceId, currentUser);
    where.invoiceId = query.invoiceId;
  }
  if (query.fromDate || query.toDate) {
    where.paymentDate = {
      ...(query.fromDate && { gte: new Date(query.fromDate) }),
      ...(query.toDate && { lte: new Date(query.toDate) }),
    };
  }

  const { payments, total } = await billingRepository.getPayments({
    where,
    skip,
    take: limit,
    orderBy: {
      [query.sortBy || "paymentDate"]:
        query.sortOrder === "asc" ? "asc" : "desc",
    },
  });

  const now = new Date();
  const allInvoices = await prisma.invoice.findMany({
    where: {
      invoiceStatus: {
        in: [InvoiceStatus.ISSUED, InvoiceStatus.SENT, InvoiceStatus.OVERDUE],
      },
      paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL] },
      ...(Object.keys(caseScope).length > 0 ? { case: caseScope } : {}),
    },
    include: {
      payments: true,
      creditNotes: true,
    },
  });

  const aging = {
    current: 0,
    days31to60: 0,
    days61to90: 0,
    days90Plus: 0,
    totalOutstanding: 0,
  };

  for (const inv of allInvoices) {
    const paid = inv.payments.reduce((acc, p) => acc + Number(p.amount), 0);
    const credited = inv.creditNotes.reduce(
      (acc, c) => acc + Number(c.amount),
      0,
    );
    const outstanding = Math.max(0, Number(inv.amountDue) - paid - credited);
    if (outstanding <= 0) continue;

    aging.totalOutstanding += outstanding;
    const baseDate = inv.dueDate
      ? new Date(inv.dueDate)
      : new Date(inv.createdAt);
    const diffDays = Math.floor((now - baseDate) / (1000 * 60 * 60 * 24));

    if (diffDays <= 30) {
      aging.current += outstanding;
    } else if (diffDays <= 60) {
      aging.days31to60 += outstanding;
    } else if (diffDays <= 90) {
      aging.days61to90 += outstanding;
    } else {
      aging.days90Plus += outstanding;
    }
  }

  return {
    ...paginate(payments, total, page, limit, "payments"),
    agingSummary: {
      current: Number(aging.current.toFixed(2)),
      days31to60: Number(aging.days31to60.toFixed(2)),
      days61to90: Number(aging.days61to90.toFixed(2)),
      days90Plus: Number(aging.days90Plus.toFixed(2)),
      totalOutstanding: Number(aging.totalOutstanding.toFixed(2)),
    },
  };
};

const syncInvoiceToQuickBooks = async (invoiceId, currentUser) => {
  const invoice = await billingRepository.findInvoiceById(invoiceId);
  if (!invoice) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(invoice.caseId, currentUser);

  return runTransaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        quickBooksSyncStatus: IntegrationSyncStatus.SUCCESS,
        quickBooksLastSyncedAt: new Date(),
        quickBooksInvoiceId:
          invoice.quickBooksInvoiceId || `QB-${invoice.invoiceNumber}`,
      },
      select: billingRepository.invoiceSelect,
    });

    await tx.integrationSyncLog.create({
      data: {
        integrationType: IntegrationType.QUICKBOOKS,
        relatedRecordType: "Invoice",
        relatedRecordId: invoiceId,
        status: IntegrationSyncStatus.SUCCESS,
        attemptCount: 1,
        lastAttemptAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        actingUserId: currentUser.id,
        actingUserRoleSnapshot: currentUser.role?.name || null,
        action: "SYNC_QUICKBOOKS_INVOICE",
        module: "BILLING",
        affectedRecordType: "Invoice",
        affectedRecordId: invoiceId,
        newValue: { syncStatus: IntegrationSyncStatus.SUCCESS },
      },
    });

    return updated;
  });
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
            ...(toDate && { lte: new Date(toDate) }),
          },
        }
      : {}),
  };

  const caseScope = buildBillingCaseScope(currentUser);
  if (Object.keys(caseScope).length > 0) {
    if (relatedRecordType && relatedRecordType !== "Invoice") {
      return paginate([], 0, page, limit, "syncLogs");
    }

    const accessibleInvoices = await prisma.invoice.findMany({
      where: { case: caseScope },
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

  return paginate(logs, total, page, limit, "syncLogs");
};

const retryQuickBooksSync = async (data, currentUser) => {
  const roleName = currentUser?.role?.name;
  if (
    !["SUPER_ADMIN", "ACCOUNTING_STAFF", "CASE_MANAGER"].includes(roleName)
  ) {
    throw new ApiError(
      403,
      "You are not authorized to retry QuickBooks sync tasks.",
    );
  }

  const logs = await billingRepository.findIntegrationSyncLogsByIds(
    data.logIds,
  );
  if (logs.length === 0) {
    throw new ApiError(404, "No matching sync logs found.");
  }

  if (roleName === "CASE_MANAGER") {
    const invoiceIds = logs
      .filter((l) => l.relatedRecordType === "Invoice")
      .map((l) => l.relatedRecordId);
    if (invoiceIds.length > 0) {
      const invoices = await prisma.invoice.findMany({
        where: { id: { in: invoiceIds } },
        select: { caseId: true },
      });
      for (const inv of invoices) {
        await assertCanMutateCaseBilling(inv.caseId, currentUser);
      }
    }
  }

  const results = [];
  for (const log of logs) {
    const updated = await billingRepository.updateIntegrationSyncLog(log.id, {
      status: IntegrationSyncStatus.SUCCESS,
      attemptCount: log.attemptCount + 1,
      lastAttemptAt: new Date(),
      errorMessage: null,
    });
    results.push(updated);
  }

  await prisma.auditLog.create({
    data: {
      actingUserId: currentUser.id,
      actingUserRoleSnapshot: currentUser.role?.name || null,
      action: "RETRY_QUICKBOOKS_SYNC",
      module: "BILLING",
      affectedRecordType: "IntegrationSyncLog",
      affectedRecordId: data.logIds.join(","),
      newValue: { retriedCount: results.length },
    },
  });

  return {
    retriedCount: results.length,
    logs: results,
  };
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
      throw new ApiError(400, "All timesheets must belong to the selected case.");
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
  upsertCaseBillingConfig,
  getBillingConfigurationsList,
  getApprovedTimesheets,
  generateDraftInvoice,
  getInvoiceById,
  getInvoiceBatchById,
  updateInvoice,
  submitInvoiceForReview,
  finalizeInvoice,
  finalizeInvoiceBatch,
  sendInvoice,
  voidInvoice,
  reissueInvoice,
  getInvoicesList,
  recordPayment,
  recordCreditNote,
  getPaymentTracking,
  syncInvoiceToQuickBooks,
  getQuickBooksSyncLogs,
  retryQuickBooksSync,
  generateNeutralPaymentStatement,
};
