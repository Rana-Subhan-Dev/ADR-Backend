const prisma = require("../config/prisma");
const ApiError = require("../utils/apiError");
const {
  REPORT_DEFINITIONS,
  getReportDefinition,
} = require("../constants/reports.constants");
const { accessibleCaseWhere } = require("../utils/caseAccess");
const caseRepository = require("../repositories/case.repository");
const { mapCase } = require("./case.service");
const hearingRepository = require("../repositories/hearing.repository");

const paginationMeta = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
};

const userDisplayName = (user) => {
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || null;
};

const parseDateBound = (value, endOfDay = false) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
};

const agingBucketFromDueDate = (dueDate, now = new Date()) => {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const diffDays = Math.floor((now - due) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "current";
  if (diffDays <= 30) return "1-30";
  if (diffDays <= 60) return "31-60";
  if (diffDays <= 90) return "61-90";
  return "90+";
};

const buildCaseReportFilters = (currentUser, query) => {
  const accessWhere = accessibleCaseWhere(currentUser);
  const filters = Object.keys(accessWhere).length ? [accessWhere] : [];

  if (query.search) {
    const term = { contains: query.search, mode: "insensitive" };
    filters.push({
      OR: [
        { title: term },
        { caseNumber: term },
        { inquiry: { matterName: term } },
      ],
    });
  }

  const caseType = query.caseType;
  if (caseType) filters.push({ caseType });

  const lifecycleStatus = query.lifecycleStatus || query.caseStatus;
  if (lifecycleStatus) filters.push({ lifecycleStatus });

  if (query.disputeType) {
    const term = { contains: query.disputeType, mode: "insensitive" };
    filters.push({
      OR: [
        { disputeCategory: { name: term } },
        { inquiry: { disputeCategory: { name: term } } },
      ],
    });
  }

  if (query.neutralUserId) {
    filters.push({
      participants: {
        some: {
          userId: query.neutralUserId,
          role: "NEUTRAL",
          accessStatus: "ACTIVE",
        },
      },
    });
  }

  if (query.caseManagerUserId) {
    filters.push({
      participants: {
        some: {
          userId: query.caseManagerUserId,
          role: "CASE_MANAGER",
          accessStatus: "ACTIVE",
        },
      },
    });
  }

  const dateFrom = parseDateBound(query.dateFrom || query.fromDate);
  const dateTo = parseDateBound(query.dateTo || query.toDate, true);
  if (dateFrom || dateTo) {
    filters.push({
      createdAt: {
        ...(dateFrom && { gte: dateFrom }),
        ...(dateTo && { lte: dateTo }),
      },
    });
  }

  return filters.length === 0
    ? {}
    : filters.length === 1
      ? filters[0]
      : { AND: filters };
};

const listReports = () => ({
  reports: REPORT_DEFINITIONS.map((report) => ({
    ...report,
    generated: report.generated || new Date().toISOString(),
  })),
});

const mapCaseStatusRow = (caseRecord) => {
  const mapped = mapCase(caseRecord);
  return {
    caseType: mapped.caseType,
    caseManager: userDisplayName(mapped.caseManager),
    status: mapped.caseStatus?.label || mapped.lifecycleStatus,
    lifecycleStatus: mapped.lifecycleStatus,
    neutral: mapped.assignedNeutral,
    matterName: mapped.matterName || mapped.title,
    disputeType: mapped.disputeCategory?.name || null,
    nextHearing: mapped.hearingDate,
    lastContact: mapped.lastContactDate,
    followUp: mapped.followUpDate,
  };
};

const fetchCaseStatusRows = async (currentUser, query) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const where = buildCaseReportFilters(currentUser, query);
  const { cases, total } = await caseRepository.getCases({
    where,
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { updatedAt: "desc" },
  });
  return {
    rows: cases.map(mapCaseStatusRow),
    pagination: paginationMeta(page, limit, total),
  };
};

const fetchDisputeTypeRows = async (currentUser, query) => {
  const result = await fetchCaseStatusRows(currentUser, query);
  return {
    rows: result.rows.map((row) => ({
      caseType: row.caseType,
      disputeType: row.disputeType,
      matterName: row.matterName,
      status: row.status,
      neutral: row.neutral,
    })),
    pagination: result.pagination,
  };
};

const fetchInquiryStatusRows = async (currentUser, query) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const caseWhere = accessibleCaseWhere(currentUser);
  const accessFilter =
    Object.keys(caseWhere).length === 0
      ? null
      : {
          OR: [
            { preliminaryCaseManagerId: currentUser.id },
            { convertedCase: caseWhere },
          ],
        };
  const filters = [accessFilter].filter(Boolean);
  if (query.search) {
    const term = { contains: query.search, mode: "insensitive" };
    filters.push({ OR: [{ matterName: term }, { status: term }] });
  }
  if (query.caseManagerUserId) {
    filters.push({ preliminaryCaseManagerId: query.caseManagerUserId });
  }
  const dateFrom = parseDateBound(query.dateFrom || query.fromDate);
  const dateTo = parseDateBound(query.dateTo || query.toDate, true);
  if (dateFrom || dateTo) {
    filters.push({
      inquiryDate: {
        ...(dateFrom && { gte: dateFrom }),
        ...(dateTo && { lte: dateTo }),
      },
    });
  }
  const where = filters.length ? { AND: filters } : {};
  const [inquiries, total] = await prisma.$transaction([
    prisma.inquiry.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { inquiryDate: "desc" },
      select: {
        id: true,
        matterName: true,
        status: true,
        inquiryDate: true,
        convertedCase: { select: { caseNumber: true } },
      },
    }),
    prisma.inquiry.count({ where }),
  ]);
  return {
    rows: inquiries.map((inquiry) => ({
      matterName: inquiry.matterName,
      status: inquiry.status,
      inquiryDate: inquiry.inquiryDate,
      caseNumber: inquiry.convertedCase?.caseNumber || null,
    })),
    pagination: paginationMeta(page, limit, total),
  };
};

const fetchContactRows = async (query, { neutralOnly = false } = {}) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const where = {};
  if (neutralOnly) {
    where.role = { contains: "neutral", mode: "insensitive" };
  }
  if (query.search) {
    const term = { contains: query.search, mode: "insensitive" };
    where.OR = [
      { name: term },
      { email: term },
      { phone: term },
      { role: term },
      { company: term },
    ];
  }
  const [contacts, total] = await prisma.$transaction([
    prisma.contact.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.contact.count({ where }),
  ]);
  return {
    rows: contacts.map((contact) => ({
      name: contact.name,
      role: contact.role,
      company: contact.company || null,
      email: contact.email,
      phone: contact.phone,
      state: null,
      updated: contact.updatedAt,
    })),
    pagination: paginationMeta(page, limit, total),
  };
};

const fetchUpcomingHearingsRows = async (currentUser, query) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const now = new Date();
  const dateFrom = parseDateBound(query.dateFrom || query.fromDate) || now;
  const dateTo = parseDateBound(query.dateTo || query.toDate, true);

  const caseFilters = [];
  const accessWhere = accessibleCaseWhere(currentUser);
  if (Object.keys(accessWhere).length) caseFilters.push(accessWhere);
  if (query.caseType) caseFilters.push({ caseType: query.caseType });
  if (query.neutralUserId) {
    caseFilters.push({
      participants: {
        some: {
          userId: query.neutralUserId,
          role: "NEUTRAL",
          accessStatus: "ACTIVE",
        },
      },
    });
  }
  if (query.caseManagerUserId) {
    caseFilters.push({
      participants: {
        some: {
          userId: query.caseManagerUserId,
          role: "CASE_MANAGER",
          accessStatus: "ACTIVE",
        },
      },
    });
  }

  const hearingWhere = {
    hearingStatus: { in: ["PENDING", "CONFIRMED", "RESCHEDULED"] },
    startTime: {
      gte: dateFrom,
      ...(dateTo && { lte: dateTo }),
    },
    ...(caseFilters.length
      ? {
          case:
            caseFilters.length === 1 ? caseFilters[0] : { AND: caseFilters },
        }
      : {}),
  };
  if (query.search) {
    const term = { contains: query.search, mode: "insensitive" };
    hearingWhere.OR = [
      { title: term },
      { case: { caseNumber: term } },
      { case: { title: term } },
    ];
  }
  const [hearings, total] = await hearingRepository.getHearings({
    where: hearingWhere,
    skip: (page - 1) * limit,
    take: limit,
  });
  return {
    rows: hearings.map((hearing) => {
      const neutral = (hearing.attendees || [])
        .filter((a) => a.caseParticipant?.role === "NEUTRAL")
        .map((a) => userDisplayName(a.caseParticipant?.user))
        .filter(Boolean)[0];
      return {
        caseNumber: hearing.case?.caseNumber || null,
        matter: hearing.case?.title || null,
        title: hearing.title,
        hearingDate: hearing.hearingDate || hearing.startTime,
        startTime: hearing.startTime,
        location: hearing.location,
        neutral,
        status: hearing.hearingStatus,
      };
    }),
    pagination: paginationMeta(page, limit, total),
  };
};

const fetchOverdueInvoicesRows = async (currentUser, query) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const now = new Date();
  const caseFilters = [accessibleCaseWhere(currentUser)].filter(
    (w) => Object.keys(w).length,
  );
  if (query.caseType) caseFilters.push({ caseType: query.caseType });
  if (query.neutralUserId) {
    caseFilters.push({
      participants: {
        some: {
          userId: query.neutralUserId,
          role: "NEUTRAL",
          accessStatus: "ACTIVE",
        },
      },
    });
  }

  const where = {
    invoiceStatus: { not: "VOID" },
    paymentStatus: { in: ["UNPAID", "PARTIAL"] },
    dueDate: { lt: now },
    ...(caseFilters.length
      ? {
          case: caseFilters.length === 1 ? caseFilters[0] : { AND: caseFilters },
        }
      : {}),
  };
  if (query.paymentStatus) {
    where.paymentStatus = query.paymentStatus;
  }
  if (query.search) {
    const term = { contains: query.search, mode: "insensitive" };
    where.OR = [
      { invoiceNumber: term },
      { case: { caseNumber: term } },
      { case: { title: term } },
    ];
  }
  const dateFrom = parseDateBound(query.dateFrom || query.fromDate);
  const dateTo = parseDateBound(query.dateTo || query.toDate, true);
  if (dateFrom || dateTo) {
    where.dueDate = {
      ...(where.dueDate || {}),
      ...(dateFrom && { gte: dateFrom }),
      ...(dateTo && { lte: dateTo }),
      lt: now,
    };
  }

  const [invoices, total] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        invoiceNumber: true,
        amountDue: true,
        paymentStatus: true,
        dueDate: true,
        invoiceDate: true,
        payments: { select: { amount: true } },
        creditNotes: { select: { amount: true } },
        case: {
          select: {
            caseNumber: true,
            title: true,
            jurisdiction: true,
            participants: {
              where: { role: "NEUTRAL", accessStatus: "ACTIVE" },
              take: 1,
              select: {
                user: {
                  select: { firstName: true, lastName: true, email: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.invoice.count({ where }),
  ]);

  let rows = invoices.map((invoice) => {
    const paid = (invoice.payments || []).reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    );
    const credited = (invoice.creditNotes || []).reduce(
      (sum, c) => sum + Number(c.amount || 0),
      0,
    );
    const openBalance = Math.max(0, Number(invoice.amountDue) - paid - credited);
    const aging = agingBucketFromDueDate(invoice.dueDate, now);
    return {
      matter: invoice.case?.title || invoice.case?.caseNumber,
      caseNumber: invoice.case?.caseNumber,
      neutral: userDisplayName(invoice.case?.participants?.[0]?.user),
      amount: Number(invoice.amountDue),
      openBalance,
      status: invoice.paymentStatus,
      paymentStatus: invoice.paymentStatus,
      invoiceStatus: "OVERDUE",
      aging,
      agingBucket: aging,
      date: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      state: invoice.case?.jurisdiction || null,
      invoiceNumber: invoice.invoiceNumber,
    };
  });

  if (query.agingBucket) {
    const wanted = String(query.agingBucket).toLowerCase();
    rows = rows.filter(
      (row) => String(row.agingBucket || "").toLowerCase() === wanted,
    );
  }

  return {
    rows,
    pagination: paginationMeta(page, limit, total),
  };
};

const getReportData = async (reportId, query, currentUser) => {
  const report = getReportDefinition(reportId);
  if (!report) throw new ApiError(404, "Report not found.");

  let dataset;
  switch (reportId) {
    case "case-status":
      dataset = await fetchCaseStatusRows(currentUser, query);
      break;
    case "dispute-type":
      dataset = await fetchDisputeTypeRows(currentUser, query);
      break;
    case "inquiry-status":
      dataset = await fetchInquiryStatusRows(currentUser, query);
      break;
    case "all-contacts":
      dataset = await fetchContactRows(query);
      break;
    case "neutral-contact":
      dataset = await fetchContactRows(query, { neutralOnly: true });
      break;
    case "hearings-upcoming":
      dataset = await fetchUpcomingHearingsRows(currentUser, query);
      break;
    case "invoices-overdue":
      dataset = await fetchOverdueInvoicesRows(currentUser, query);
      break;
    default:
      throw new ApiError(404, "Report not found.");
  }

  return {
    report: {
      ...report,
      generated: new Date().toISOString(),
    },
    rows: dataset.rows,
    pagination: dataset.pagination,
  };
};

module.exports = {
  listReports,
  getReportData,
};
