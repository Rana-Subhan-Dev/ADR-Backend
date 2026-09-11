const prisma = require("../config/prisma");

const partyContactSelect = {
  id: true,
  side: true,
  partyType: true,
  firstName: true,
  lastName: true,
  organizationName: true,
  email: true,
};

const billingConfigScalarSelect = {
  id: true,
  caseId: true,
  billingType: true,
  billingInputSource: true,
  billingMode: true,
  neutralHourlyRate: true,
  neutralDailyRate: true,
  caseManagementHourlyRate: true,
  flatFeeAmount: true,
  includedHearingDays: true,
  includedPrePostHearingHours: true,
  overageHourlyRate: true,
  additionalDayRate: true,
  customRate: true,
  customRateDescription: true,
  expensesPolicy: true,
  travelTimeRateType: true,
  travelTimeCustomHourlyRate: true,
  splitBillingEnabled: true,
  roundingResidualCasePartyId: true,
  taxApplicability: true,
  deliveryContactEmail: true,
  billingNotes: true,
  accountingAuditComplete: true,
  fedArbFeeScheduleType: true,
  setupFee: true,
  administrationFee: true,
  adminFeePercentage: true,
  agreementFeePercentage: true,
  hasTrustAccount: true,
  createdAt: true,
  updatedAt: true,
};

const billingConfigSelect = {
  ...billingConfigScalarSelect,
  roundingResidualCaseParty: {
    select: partyContactSelect,
  },
  payerSplits: {
    select: {
      id: true,
      casePartyId: true,
      invoiceContactEmail: true,
      invoiceContactName: true,
      splitPercentage: true,
      caseParty: {
        select: partyContactSelect,
      },
    },
    orderBy: { createdAt: "asc" },
  },
  additionalTimekeepers: {
    select: {
      id: true,
      role: true,
      hourlyRate: true,
      expensesAllowed: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  },
  case: {
    select: {
      id: true,
      caseNumber: true,
      title: true,
      caseType: true,
      lifecycleStatus: true,
      parties: {
        select: partyContactSelect,
      },
      participants: {
        where: { role: "NEUTRAL", accessStatus: "ACTIVE" },
        select: {
          id: true,
          role: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  },
};

const invoiceSelect = {
  id: true,
  caseId: true,
  invoiceNumber: true,
  invoiceType: true,
  invoiceStatus: true,
  paymentStatus: true,
  payerCasePartyId: true,
  amountDue: true,
  dueDate: true,
  specialInstructions: true,
  quickBooksInvoiceId: true,
  quickBooksSyncStatus: true,
  quickBooksLastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
  case: {
    select: {
      id: true,
      caseNumber: true,
      title: true,
      caseType: true,
      lifecycleStatus: true,
    },
  },
  payerCaseParty: {
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
  lineItems: {
    select: {
      id: true,
      invoiceId: true,
      description: true,
      quantity: true,
      unitPrice: true,
      amount: true,
      relatedTimesheetId: true,
      relatedTimesheet: {
        select: {
          id: true,
          activityType: true,
          hours: true,
          entryDate: true,
          neutral: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  },
  payments: {
    select: {
      id: true,
      invoiceId: true,
      amount: true,
      paymentDate: true,
      method: true,
      quickBooksPaymentId: true,
      createdAt: true,
    },
    orderBy: { paymentDate: "desc" },
  },
  creditNotes: {
    select: {
      id: true,
      invoiceId: true,
      amount: true,
      reason: true,
      issuedAt: true,
      quickBooksCreditNoteId: true,
    },
    orderBy: { issuedAt: "desc" },
  },
};

const findBillingConfigByCaseId = (caseId, tx = prisma) =>
  tx.billingConfiguration.findUnique({
    where: { caseId },
    select: billingConfigSelect,
  });

const upsertBillingConfig = async (
  caseId,
  { scalarData, payerSplits, additionalTimekeepers },
  tx = prisma,
) => {
  const saved = await tx.billingConfiguration.upsert({
    where: { caseId },
    update: scalarData,
    create: { caseId, ...scalarData },
    select: { id: true },
  });

  if (payerSplits !== undefined) {
    await tx.billingPayerSplit.deleteMany({
      where: { billingConfigurationId: saved.id },
    });
    if (payerSplits.length > 0) {
      await tx.billingPayerSplit.createMany({
        data: payerSplits.map((row) => ({
          billingConfigurationId: saved.id,
          casePartyId: row.casePartyId,
          invoiceContactEmail: row.invoiceContactEmail || null,
          invoiceContactName: row.invoiceContactName || null,
          splitPercentage: row.splitPercentage,
        })),
      });
    }
  }

  if (additionalTimekeepers !== undefined) {
    await tx.billingAdditionalTimekeeper.deleteMany({
      where: { billingConfigurationId: saved.id },
    });
    if (additionalTimekeepers.length > 0) {
      await tx.billingAdditionalTimekeeper.createMany({
        data: additionalTimekeepers.map((row) => ({
          billingConfigurationId: saved.id,
          role: row.role,
          hourlyRate: row.hourlyRate,
          expensesAllowed: row.expensesAllowed || "NOT_ALLOWED",
        })),
      });
    }
  }

  return tx.billingConfiguration.findUnique({
    where: { id: saved.id },
    select: billingConfigSelect,
  });
};

const getBillingConfigurations = async ({ where, skip, take, orderBy }) => {
  const [items, total] = await prisma.$transaction([
    prisma.billingConfiguration.findMany({
      where,
      skip,
      take,
      orderBy,
      select: billingConfigSelect,
    }),
    prisma.billingConfiguration.count({ where }),
  ]);
  return { items, total };
};

const getCasesWithOrWithoutBilling = async ({ where, skip, take, orderBy }) => {
  const [cases, total] = await prisma.$transaction([
    prisma.case.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        caseNumber: true,
        title: true,
        caseType: true,
        lifecycleStatus: true,
        createdAt: true,
        updatedAt: true,
        billingConfiguration: {
          select: {
            ...billingConfigScalarSelect,
            payerSplits: {
              select: {
                id: true,
                casePartyId: true,
                invoiceContactEmail: true,
                invoiceContactName: true,
                splitPercentage: true,
              },
              orderBy: { createdAt: "asc" },
            },
            additionalTimekeepers: {
              select: {
                id: true,
                role: true,
                hourlyRate: true,
                expensesAllowed: true,
              },
              orderBy: { createdAt: "asc" },
            },
          },
        },
        parties: {
          select: partyContactSelect,
        },
        participants: {
          where: { role: "NEUTRAL", accessStatus: "ACTIVE" },
          select: {
            id: true,
            role: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    }),
    prisma.case.count({ where }),
  ]);
  return { cases, total };
};

const findApprovedTimesheets = async ({ where, skip, take, orderBy }) => {
  const [timesheets, total] = await prisma.$transaction([
    prisma.neutralTimesheet.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        caseId: true,
        hearingId: true,
        neutralUserId: true,
        activityType: true,
        hours: true,
        entryDate: true,
        status: true,
        approvalStatus: true,
        createdAt: true,
        neutral: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        case: {
          select: {
            id: true,
            caseNumber: true,
            title: true,
            caseType: true,
            lifecycleStatus: true,
            billingConfiguration: {
              select: {
                id: true,
                billingType: true,
                billingInputSource: true,
                neutralHourlyRate: true,
                overageHourlyRate: true,
                caseManagementHourlyRate: true,
                adminFeePercentage: true,
                agreementFeePercentage: true,
                splitBillingEnabled: true,
              },
            },
          },
        },
        hearing: {
          select: {
            id: true,
            hearingReference: true,
            title: true,
          },
        },
        lineItems: {
          select: {
            id: true,
            invoiceId: true,
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                invoiceStatus: true,
              },
            },
          },
        },
      },
    }),
    prisma.neutralTimesheet.count({ where }),
  ]);
  return { timesheets, total };
};

const findTimesheetsByIds = (ids, tx = prisma) =>
  tx.neutralTimesheet.findMany({
    where: { id: { in: ids } },
    include: {
      neutral: true,
      case: {
        include: {
          billingConfiguration: true,
        },
      },
    },
  });

const createInvoice = (data, tx = prisma) =>
  tx.invoice.create({
    data,
    select: invoiceSelect,
  });

const findInvoiceById = (id, tx = prisma) =>
  tx.invoice.findUnique({
    where: { id },
    select: invoiceSelect,
  });

const updateInvoice = (id, data, tx = prisma) =>
  tx.invoice.update({
    where: { id },
    data,
    select: invoiceSelect,
  });

const deleteLineItemsByInvoiceId = (invoiceId, tx = prisma) =>
  tx.invoiceLineItem.deleteMany({
    where: { invoiceId },
  });

const getInvoices = async ({ where, skip, take, orderBy }) => {
  const [invoices, total] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      skip,
      take,
      orderBy,
      select: invoiceSelect,
    }),
    prisma.invoice.count({ where }),
  ]);
  return { invoices, total };
};

const createPayment = (data, tx = prisma) =>
  tx.payment.create({
    data,
    select: {
      id: true,
      invoiceId: true,
      amount: true,
      paymentDate: true,
      method: true,
      quickBooksPaymentId: true,
      createdAt: true,
      invoice: {
        select: invoiceSelect,
      },
    },
  });

const createCreditNote = (data, tx = prisma) =>
  tx.creditNote.create({
    data,
    select: {
      id: true,
      invoiceId: true,
      amount: true,
      reason: true,
      issuedAt: true,
      quickBooksCreditNoteId: true,
      invoice: {
        select: invoiceSelect,
      },
    },
  });

const getPayments = async ({ where, skip, take, orderBy }) => {
  const [payments, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      skip,
      take,
      orderBy,
      select: {
        id: true,
        invoiceId: true,
        amount: true,
        paymentDate: true,
        method: true,
        quickBooksPaymentId: true,
        createdAt: true,
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            caseId: true,
            invoiceStatus: true,
            paymentStatus: true,
            amountDue: true,
            case: {
              select: {
                id: true,
                caseNumber: true,
                title: true,
              },
            },
            payerCaseParty: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                organizationName: true,
              },
            },
          },
        },
      },
    }),
    prisma.payment.count({ where }),
  ]);
  return { payments, total };
};

const createIntegrationSyncLog = (data, tx = prisma) =>
  tx.integrationSyncLog.create({
    data,
  });

const findIntegrationSyncLogs = async ({ where, skip, take, orderBy }) => {
  const [logs, total] = await prisma.$transaction([
    prisma.integrationSyncLog.findMany({
      where,
      skip,
      take,
      orderBy,
    }),
    prisma.integrationSyncLog.count({ where }),
  ]);
  return { logs, total };
};

const findIntegrationSyncLogsByIds = (ids) =>
  prisma.integrationSyncLog.findMany({
    where: { id: { in: ids } },
  });

const updateIntegrationSyncLog = (id, data, tx = prisma) =>
  tx.integrationSyncLog.update({
    where: { id },
    data,
  });

module.exports = {
  billingConfigSelect,
  billingConfigScalarSelect,
  invoiceSelect,
  findBillingConfigByCaseId,
  upsertBillingConfig,
  getBillingConfigurations,
  getCasesWithOrWithoutBilling,
  findApprovedTimesheets,
  findTimesheetsByIds,
  createInvoice,
  findInvoiceById,
  updateInvoice,
  deleteLineItemsByInvoiceId,
  getInvoices,
  createPayment,
  createCreditNote,
  getPayments,
  createIntegrationSyncLog,
  findIntegrationSyncLogs,
  findIntegrationSyncLogsByIds,
  updateIntegrationSyncLog,
};
