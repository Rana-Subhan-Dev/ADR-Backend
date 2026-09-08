const prisma = require("../config/prisma");

const billingConfigSelect = {
  id: true,
  caseId: true,
  billingType: true,
  neutralHourlyRate: true,
  caseManagementHourlyRate: true,
  flatFeeAmount: true,
  claimantSplitPercentage: true,
  respondentSplitPercentage: true,
  taxApplicability: true,
  deliveryContactEmail: true,
  billingNotes: true,
  setupFee: true,
  administrationFee: true,
  hasTrustAccount: true,
  createdAt: true,
  updatedAt: true,
  case: {
    select: {
      id: true,
      caseNumber: true,
      title: true,
      caseType: true,
      lifecycleStatus: true,
      parties: {
        select: {
          id: true,
          side: true,
          partyType: true,
          firstName: true,
          lastName: true,
          organizationName: true,
          email: true,
        },
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

const upsertBillingConfig = (caseId, data, tx = prisma) =>
  tx.billingConfiguration.upsert({
    where: { caseId },
    update: data,
    create: { caseId, ...data },
    select: billingConfigSelect,
  });

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
            id: true,
            billingType: true,
            neutralHourlyRate: true,
            caseManagementHourlyRate: true,
            flatFeeAmount: true,
            claimantSplitPercentage: true,
            respondentSplitPercentage: true,
            taxApplicability: true,
            deliveryContactEmail: true,
            billingNotes: true,
            setupFee: true,
            administrationFee: true,
            hasTrustAccount: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        parties: {
          select: {
            id: true,
            side: true,
            partyType: true,
            firstName: true,
            lastName: true,
            organizationName: true,
            email: true,
          },
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
                neutralHourlyRate: true,
                caseManagementHourlyRate: true,
                claimantSplitPercentage: true,
                respondentSplitPercentage: true,
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
