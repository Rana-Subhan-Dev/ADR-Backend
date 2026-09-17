const {
  UserStatus,
  CaseLifecycleStatus,
  InvoiceStatus,
  PaymentStatus,
} = require("@prisma/client");
const prisma = require("../config/prisma");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const paginate = (items, total, page, limit, key) => {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    [key]: items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

const parsePageLimit = (query) => {
  const page = Number(query.page) || DEFAULT_PAGE;
  const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  return { page, limit, skip: (page - 1) * limit };
};

const partyDisplayName = (party) => {
  if (!party) return null;
  if (party.organizationName) return party.organizationName;
  const name = [party.firstName, party.lastName].filter(Boolean).join(" ");
  return name || null;
};

const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const buildMonthBuckets = (count = 12) => {
  const now = new Date();
  const buckets = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1),
    );
    buckets.push({
      label: `${monthLabels[start.getUTCMonth()]} ${start.getUTCFullYear()}`,
      start,
      end,
    });
  }
  return buckets;
};

const buildYearBuckets = (count = 5) => {
  const now = new Date();
  const buckets = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const year = now.getUTCFullYear() - i;
    buckets.push({
      label: String(year),
      start: new Date(Date.UTC(year, 0, 1)),
      end: new Date(Date.UTC(year + 1, 0, 1)),
    });
  }
  return buckets;
};

const sumDecimal = (rows, field = "amount") =>
  rows.reduce((acc, row) => acc + Number(row[field] || 0), 0);

const getDashboard = async (query) => {
  const period = query.invoicePeriod || "monthly";
  const buckets =
    period === "yearly" ? buildYearBuckets(5) : buildMonthBuckets(12);
  const rangeStart = buckets[0].start;
  const rangeEnd = buckets[buckets.length - 1].end;

  const [
    totalUsers,
    blockedUsers,
    totalCases,
    totalInvoices,
    payments,
    openInvoices,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: {
        status: { in: [UserStatus.DEACTIVATED, UserStatus.LOCKED] },
      },
    }),
    prisma.case.count(),
    prisma.invoice.count({
      where: { invoiceStatus: { not: InvoiceStatus.VOID } },
    }),
    prisma.payment.findMany({
      where: {
        paymentDate: { gte: rangeStart, lt: rangeEnd },
      },
      select: { amount: true, paymentDate: true },
    }),
    prisma.invoice.findMany({
      where: {
        invoiceStatus: { not: InvoiceStatus.VOID },
        paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL] },
        OR: [
          {
            dueDate: { gte: rangeStart, lt: rangeEnd },
          },
          {
            dueDate: null,
            createdAt: { gte: rangeStart, lt: rangeEnd },
          },
        ],
      },
      select: {
        amountDue: true,
        dueDate: true,
        createdAt: true,
        payments: { select: { amount: true } },
        creditNotes: { select: { amount: true } },
      },
    }),
  ]);

  const series = buckets.map((bucket) => {
    const receivedAmount = sumDecimal(
      payments.filter(
        (p) => p.paymentDate >= bucket.start && p.paymentDate < bucket.end,
      ),
    );
    const dueAmount = openInvoices.reduce((acc, inv) => {
      const anchor = inv.dueDate || inv.createdAt;
      if (anchor < bucket.start || anchor >= bucket.end) return acc;
      const paid = sumDecimal(inv.payments);
      const credits = sumDecimal(inv.creditNotes);
      const outstanding = Math.max(0, Number(inv.amountDue) - paid - credits);
      return acc + outstanding;
    }, 0);

    return {
      label: bucket.label,
      receivedAmount: Math.round(receivedAmount * 100) / 100,
      dueAmount: Math.round(dueAmount * 100) / 100,
    };
  });

  return {
    kpis: {
      totalUsers,
      blockedUsers,
      totalCases,
      totalInvoices,
    },
    invoicesOverview: {
      period,
      series,
      receivedAmount:
        Math.round(series.reduce((a, s) => a + s.receivedAmount, 0) * 100) /
        100,
      dueAmount:
        Math.round(series.reduce((a, s) => a + s.dueAmount, 0) * 100) / 100,
    },
  };
};

const resolveFirmName = (user) => {
  if (user.attorneyProfile?.lawFirm?.name) {
    return user.attorneyProfile.lawFirm.name;
  }
  const party = user.caseParticipations?.find(
    (p) => p.caseParty?.organizationName,
  )?.caseParty;
  if (party?.organizationName) return party.organizationName;
  if (user.jobTitle) return user.jobTitle;
  return null;
};

const getAdminUsers = async (query) => {
  const { page, limit, skip } = parsePageLimit(query);
  const where = {};

  if (query.role) where.role = { name: query.role };
  if (query.status) where.status = query.status;

  if (query.search) {
    const term = query.search.trim();
    if (term) {
      where.OR = [
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
        { phone: { contains: term, mode: "insensitive" } },
        { jobTitle: { contains: term, mode: "insensitive" } },
        {
          attorneyProfile: {
            lawFirm: { name: { contains: term, mode: "insensitive" } },
          },
        },
        {
          caseParticipations: {
            some: {
              caseParty: {
                organizationName: { contains: term, mode: "insensitive" },
              },
            },
          },
        },
      ];
    }
  }

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        jobTitle: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        role: { select: { id: true, name: true } },
        attorneyProfile: {
          select: {
            lawFirm: { select: { id: true, name: true } },
          },
        },
        caseParticipations: {
          where: { casePartyId: { not: null } },
          take: 5,
          select: {
            caseParty: {
              select: { organizationName: true },
            },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const rows = users.map((user) => ({
    id: user.id,
    name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
    firstName: user.firstName,
    lastName: user.lastName,
    firmCompany: resolveFirmName(user),
    role: user.role?.name || null,
    email: user.email,
    phone: user.phone,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }));

  return paginate(rows, total, page, limit, "users");
};

const mapUiCaseStatus = (status) => {
  if (!status || status === "ANY") return null;
  if (status === "PENDING") return [CaseLifecycleStatus.INTAKE, CaseLifecycleStatus.SCHEDULED];
  if (status === "ACTIVE") {
    return [CaseLifecycleStatus.ACTIVE, CaseLifecycleStatus.REOPENED];
  }
  if (Object.values(CaseLifecycleStatus).includes(status)) return [status];
  return [status];
};

const getAdminCases = async (query) => {
  const { page, limit, skip } = parsePageLimit(query);
  const where = {};

  const statusFilter = mapUiCaseStatus(query.status);
  if (statusFilter) where.lifecycleStatus = { in: statusFilter };

  if (query.search) {
    const term = query.search.trim();
    where.OR = [
      { caseNumber: { contains: term, mode: "insensitive" } },
      { title: { contains: term, mode: "insensitive" } },
      {
        participants: {
          some: {
            role: "CASE_MANAGER",
            user: {
              OR: [
                { firstName: { contains: term, mode: "insensitive" } },
                { lastName: { contains: term, mode: "insensitive" } },
                { email: { contains: term, mode: "insensitive" } },
              ],
            },
          },
        },
      },
    ];
  }

  const [cases, total, activeCount, closedCount, allCount] =
    await prisma.$transaction([
      prisma.case.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          caseNumber: true,
          title: true,
          lifecycleStatus: true,
          createdAt: true,
          updatedAt: true,
          closedAt: true,
          participants: {
            where: { role: "CASE_MANAGER", isPrimary: true },
            take: 1,
            select: {
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
      prisma.case.count({
        where: {
          lifecycleStatus: {
            in: [CaseLifecycleStatus.ACTIVE, CaseLifecycleStatus.REOPENED],
          },
        },
      }),
      prisma.case.count({
        where: { lifecycleStatus: CaseLifecycleStatus.CLOSED },
      }),
      prisma.case.count(),
    ]);

  const rows = cases.map((c) => {
    const manager = c.participants?.[0]?.user;
    return {
      id: c.id,
      caseNumber: c.caseNumber,
      title: c.title,
      caseManager: manager
        ? {
            id: manager.id,
            name: `${manager.firstName || ""} ${manager.lastName || ""}`.trim(),
            email: manager.email,
          }
        : null,
      status: c.lifecycleStatus,
      reviewDate: c.updatedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      closedAt: c.closedAt,
    };
  });

  return {
    ...paginate(rows, total, page, limit, "cases"),
    summary: {
      total: allCount,
      active: activeCount,
      closed: closedCount,
    },
  };
};

const buildAdminInvoiceStatusWhere = (status) => {
  if (!status || status === "ANY") return {};
  if (status === "PAID") {
    return {
      invoiceStatus: { not: InvoiceStatus.VOID },
      paymentStatus: PaymentStatus.PAID,
    };
  }
  if (status === "OVERDUE") {
    return {
      invoiceStatus: { not: InvoiceStatus.VOID },
      OR: [
        { invoiceStatus: InvoiceStatus.OVERDUE },
        {
          paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL] },
          dueDate: { lt: new Date() },
        },
      ],
    };
  }
  if (status === "OUTSTANDING") {
    return {
      invoiceStatus: {
        in: [InvoiceStatus.ISSUED, InvoiceStatus.SENT, InvoiceStatus.DRAFT],
      },
      paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL] },
      OR: [{ dueDate: null }, { dueDate: { gte: new Date() } }],
    };
  }
  return {};
};

const mapInvoiceUiStatus = (invoice) => {
  if (invoice.paymentStatus === PaymentStatus.PAID) return "PAID";
  if (
    invoice.invoiceStatus === InvoiceStatus.OVERDUE ||
    (invoice.dueDate &&
      new Date(invoice.dueDate) < new Date() &&
      [PaymentStatus.UNPAID, PaymentStatus.PARTIAL].includes(
        invoice.paymentStatus,
      ))
  ) {
    return "OVERDUE";
  }
  return "OUTSTANDING";
};

const getAdminInvoices = async (query) => {
  const { page, limit, skip } = parsePageLimit(query);
  const statusWhere = buildAdminInvoiceStatusWhere(query.status);

  const where = {
    invoiceStatus: { not: InvoiceStatus.VOID },
    ...statusWhere,
  };

  if (query.search) {
    const term = query.search.trim();
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { invoiceNumber: { contains: term, mode: "insensitive" } },
          {
            case: {
              caseNumber: { contains: term, mode: "insensitive" },
            },
          },
          { case: { title: { contains: term, mode: "insensitive" } } },
          {
            payerCaseParty: {
              organizationName: { contains: term, mode: "insensitive" },
            },
          },
          {
            payerCaseParty: {
              firstName: { contains: term, mode: "insensitive" },
            },
          },
          {
            payerCaseParty: {
              lastName: { contains: term, mode: "insensitive" },
            },
          },
          {
            payerCaseParty: {
              email: { contains: term, mode: "insensitive" },
            },
          },
        ],
      },
    ];
  }

  const nonVoid = { invoiceStatus: { not: InvoiceStatus.VOID } };

  const [invoices, total, billedAgg, paidInvoices, unpaidInvoices] =
    await prisma.$transaction([
      prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          invoiceNumber: true,
          invoiceStatus: true,
          paymentStatus: true,
          amountDue: true,
          dueDate: true,
          createdAt: true,
          case: {
            select: { id: true, caseNumber: true, title: true },
          },
          payerCaseParty: {
            select: {
              id: true,
              organizationName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          payments: { select: { amount: true } },
          creditNotes: { select: { amount: true } },
        },
      }),
      prisma.invoice.count({ where }),
      prisma.invoice.aggregate({
        where: nonVoid,
        _sum: { amountDue: true },
      }),
      prisma.invoice.findMany({
        where: { ...nonVoid, paymentStatus: PaymentStatus.PAID },
        select: {
          amountDue: true,
          payments: { select: { amount: true } },
        },
      }),
      prisma.invoice.findMany({
        where: {
          ...nonVoid,
          paymentStatus: { in: [PaymentStatus.UNPAID, PaymentStatus.PARTIAL] },
        },
        select: {
          amountDue: true,
          payments: { select: { amount: true } },
          creditNotes: { select: { amount: true } },
        },
      }),
    ]);

  const totalBilled = Number(billedAgg._sum.amountDue || 0);
  const paid = paidInvoices.reduce(
    (acc, inv) => acc + sumDecimal(inv.payments),
    0,
  );
  const unpaidBalance = unpaidInvoices.reduce((acc, inv) => {
    const settled =
      sumDecimal(inv.payments) + sumDecimal(inv.creditNotes);
    return acc + Math.max(0, Number(inv.amountDue) - settled);
  }, 0);

  const rows = invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    caseId: inv.case?.id || null,
    caseNumber: inv.case?.caseNumber || null,
    caseTitle: inv.case?.title || null,
    billedTo: partyDisplayName(inv.payerCaseParty),
    status: mapInvoiceUiStatus(inv),
    invoiceStatus: inv.invoiceStatus,
    paymentStatus: inv.paymentStatus,
    dueDate: inv.dueDate,
    amount: Number(inv.amountDue),
    createdAt: inv.createdAt,
  }));

  return {
    ...paginate(rows, total, page, limit, "invoices"),
    summary: {
      totalBilled: Math.round(totalBilled * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      unpaidBalance: Math.round(unpaidBalance * 100) / 100,
    },
  };
};

module.exports = {
  getDashboard,
  getAdminUsers,
  getAdminCases,
  getAdminInvoices,
};
