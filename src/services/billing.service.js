const prisma = require("../config/prisma");
const billingRepository = require("../repositories/billing.repository");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");
const { sendEmail } = require("../utils/sendEmail");
const {
  InvoiceStatus,
  PaymentStatus,
  TimesheetApprovalStatus,
  IntegrationSyncStatus,
  IntegrationType,
  CaseTimelineEventType,
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
  return `${prefix}${String(sequence).padStart(4, "0")}`;
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

const upsertCaseBillingConfig = async (caseId, payload, currentUser) => {
  await assertCanMutateCaseBilling(caseId, currentUser);
  await caseService.getCaseById(caseId, currentUser);

  return prisma.$transaction(async (tx) => {
    const previous = await tx.billingConfiguration.findUnique({
      where: { caseId },
    });
    const saved = await billingRepository.upsertBillingConfig(
      caseId,
      payload,
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

  if (query.status === "CONFIGURED") {
    caseWhere.billingConfiguration = { isNot: null };
  } else if (query.status === "INCOMPLETE") {
    caseWhere.billingConfiguration = null;
  }

  if (query.billingType) {
    caseWhere.billingConfiguration = {
      ...(caseWhere.billingConfiguration || {}),
      billingType: query.billingType,
    };
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
      associationStatus,
      activeInvoice,
    };
  });

  return paginate(formatted, total, page, limit, "timesheets");
};

const generateDraftInvoice = async (payload, currentUser) => {
  const {
    caseId,
    invoiceType,
    payerCasePartyId,
    dueDate,
    specialInstructions,
    timesheetIds = [],
    lineItems = [],
    amountDue: manualAmountDue,
    applySplit = false,
    splitPartySide,
  } = payload;

  await assertCanMutateCaseBilling(caseId, currentUser);
  await caseService.getCaseById(caseId, currentUser);

  const billingConfig =
    await billingRepository.findBillingConfigByCaseId(caseId);
  const neutralRate = billingConfig?.neutralHourlyRate
    ? Number(billingConfig.neutralHourlyRate)
    : 0;
  const cmRate = billingConfig?.caseManagementHourlyRate
    ? Number(billingConfig.caseManagementHourlyRate)
    : 0;

  return prisma.$transaction(async (tx) => {
    let preparedLineItems = [];

    if (timesheetIds.length > 0) {
      const timesheets = await tx.neutralTimesheet.findMany({
        where: {
          id: { in: timesheetIds },
          caseId,
          approvalStatus: TimesheetApprovalStatus.APPROVED,
        },
        include: {
          neutral: true,
          lineItems: {
            include: { invoice: true },
          },
        },
      });

      if (timesheets.length !== timesheetIds.length) {
        throw new ApiError(
          400,
          "One or more timesheets are invalid, unapproved, or not found.",
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

        const rate =
          ts.activityType === "CASE_MANAGEMENT"
            ? cmRate || neutralRate
            : neutralRate;
        const hours = Number(ts.hours);
        const itemAmount = Math.round(hours * rate * 100) / 100;
        preparedLineItems.push({
          description: `${ts.activityType.replace(/_/g, " ")} - ${ts.neutral?.firstName || "Neutral"} ${ts.neutral?.lastName || ""} (${hours} hrs)`,
          quantity: hours,
          unitPrice: rate,
          amount: itemAmount,
          relatedTimesheetId: ts.id,
        });
      }
    }

    if (lineItems && lineItems.length > 0) {
      for (const item of lineItems) {
        const qty = Number(item.quantity || 1);
        const unitPrice = Number(item.unitPrice);
        const itemTotal =
          item.amount !== undefined
            ? Number(item.amount)
            : Math.round(qty * unitPrice * 100) / 100;
        preparedLineItems.push({
          description: item.description,
          quantity: qty,
          unitPrice,
          amount: itemTotal,
          relatedTimesheetId: item.relatedTimesheetId || null,
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
        quantity: 1,
        unitPrice: fee,
        amount: fee,
      });
      calculatedTotal += fee;
    }

    if (applySplit && splitPartySide && billingConfig) {
      const splitPct =
        splitPartySide === "CLAIMANT"
          ? Number(billingConfig.claimantSplitPercentage || 50)
          : Number(billingConfig.respondentSplitPercentage || 50);
      calculatedTotal =
        Math.round(((calculatedTotal * splitPct) / 100) * 100) / 100;
    }

    const finalAmountDue =
      manualAmountDue !== undefined ? Number(manualAmountDue) : calculatedTotal;
    const invoiceNumber = await generateInvoiceNumber(tx);

    const invoice = await tx.invoice.create({
      data: {
        caseId,
        invoiceNumber,
        invoiceType,
        invoiceStatus: InvoiceStatus.DRAFT,
        paymentStatus: PaymentStatus.UNPAID,
        payerCasePartyId: payerCasePartyId || null,
        amountDue: finalAmountDue,
        dueDate: dueDate ? new Date(dueDate) : null,
        specialInstructions: specialInstructions || null,
        lineItems: {
          create: preparedLineItems,
        },
      },
      select: billingRepository.invoiceSelect,
    });

    await tx.auditLog.create({
      data: {
        actingUserId: currentUser.id,
        actingUserRoleSnapshot: currentUser.role?.name || null,
        action: "GENERATE_DRAFT_INVOICE",
        module: "BILLING",
        affectedRecordType: "Invoice",
        affectedRecordId: invoice.id,
        newValue: JSON.parse(JSON.stringify(invoice)),
      },
    });

    await tx.caseTimelineEvent.create({
      data: {
        caseId,
        eventType: CaseTimelineEventType.INVOICE_ISSUED,
        relatedRecordType: "Invoice",
        relatedRecordId: invoice.id,
        summary: `Draft invoice ${invoice.invoiceNumber} created for amount $${finalAmountDue.toFixed(2)}`,
        actorUserId: currentUser.id,
        newValue: JSON.stringify({
          invoiceNumber,
          invoiceType,
          amountDue: finalAmountDue,
        }),
      },
    });

    return invoice;
  });
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
  return invoice;
};

const updateInvoice = async (invoiceId, payload, currentUser) => {
  const existing = await billingRepository.findInvoiceById(invoiceId);
  if (!existing) throw new ApiError(404, "Invoice not found.");
  await assertCanMutateCaseBilling(existing.caseId, currentUser);
  if (existing.invoiceStatus !== InvoiceStatus.DRAFT) {
    throw new ApiError(400, "Only draft invoices can be edited.");
  }

  return prisma.$transaction(async (tx) => {
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

  return prisma.$transaction(async (tx) => {
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

  return prisma.$transaction(async (tx) => {
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        invoiceStatus: InvoiceStatus.ISSUED,
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

  const { recipientEmails, subject, message } = payload;
  const emailSubject =
    subject || `Invoice ${invoice.invoiceNumber} from FedArb ADR`;
  const emailBody =
    message ||
    `Please find invoice ${invoice.invoiceNumber} for Case ${invoice.case?.caseNumber || ""}. Total Due: $${Number(invoice.amountDue).toFixed(2)}.`;

  for (const recipient of recipientEmails) {
    await sendEmail(emailSubject, emailBody, recipient, "TEXT");
  }

  return prisma.$transaction(async (tx) => {
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

  return prisma.$transaction(async (tx) => {
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

  return prisma.$transaction(async (tx) => {
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

  return prisma.$transaction(async (tx) => {
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

  return prisma.$transaction(async (tx) => {
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

  return prisma.$transaction(async (tx) => {
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
  const timesheets = await billingRepository.findTimesheetsByIds(
    data.timesheetIds,
  );
  if (timesheets.length !== data.timesheetIds.length) {
    throw new ApiError(400, "One or more selected timesheets do not exist.");
  }

  let totalServicesAmount = 0;
  let totalExpensesAmount = 0;

  const items = timesheets.map((ts) => {
    const hours = Number(ts.durationMinutes) / 60;
    const rate = Number(ts.hourlyRateSnapshot || 0);
    const amount = Number((hours * rate).toFixed(2));
    if (ts.activityType === "EXPENSE") {
      totalExpensesAmount += amount;
    } else {
      totalServicesAmount += amount;
    }
    return {
      timesheetId: ts.id,
      date: ts.serviceDate,
      activityType: ts.activityType,
      narrative: ts.narrative,
      hours: Number(hours.toFixed(2)),
      hourlyRate: rate,
      totalAmount: amount,
    };
  });

  const adminFeePercentage = Number(data.adminFeePercentage ?? 15.0);
  const adminFeeDeduction = Number(
    ((totalServicesAmount * adminFeePercentage) / 100).toFixed(2),
  );
  const netPayable = Number(
    (totalServicesAmount - adminFeeDeduction + totalExpensesAmount).toFixed(2),
  );

  return {
    caseId,
    statementDate: data.statementDate || new Date().toISOString(),
    neutralParticipantId:
      data.neutralParticipantId || timesheets[0]?.participantId,
    totalServicesAmount: Number(totalServicesAmount.toFixed(2)),
    adminFeePercentage,
    adminFeeDeduction,
    totalExpensesAmount: Number(totalExpensesAmount.toFixed(2)),
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
  updateInvoice,
  submitInvoiceForReview,
  finalizeInvoice,
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
