const prisma = require("../config/prisma");
const ApiError = require("../utils/apiError");
const {
  REPORT_DEFINITIONS,
  getReportDefinition,
  filterKeys,
  normalizeSupportsKey,
  normalizeCategoryQuery,
  normalizeReportTypeQuery,
} = require("../constants/reports.constants");
const { accessibleCaseWhere } = require("../utils/caseAccess");
const caseRepository = require("../repositories/case.repository");
const { mapCase } = require("./case.service");
const hearingRepository = require("../repositories/hearing.repository");

const CSV_EXPORT_MAX_ROWS = 10000;

const paginationMeta = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    page,
    limit,
    total,
    totalItems: total,
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

const applyDateRangePreset = (query = {}) => {
  if (!query.dateRange || query.dateFrom || query.dateTo) return query;
  const days = Number(query.dateRange);
  if (![7, 30, 90].includes(days)) return query;
  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setUTCDate(dateFrom.getUTCDate() - days);
  return {
    ...query,
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
  };
};

const agingBucketFromDueDate = (dueDate, now = new Date()) => {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dueDay = new Date(
    Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()),
  );
  const diffDays = Math.floor((today - dueDay) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "current";
  if (diffDays <= 30) return "1-30";
  if (diffDays <= 60) return "31-60";
  if (diffDays <= 90) return "61-90";
  return "90+";
};

const agingDueDateRange = (bucket, now = new Date()) => {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const daysAgo = (days) =>
    new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  const ranges = {
    current: { gte: today, lt: now },
    "1-30": { gte: daysAgo(30), lt: today },
    "31-60": { gte: daysAgo(60), lt: daysAgo(30) },
    "61-90": { gte: daysAgo(90), lt: daysAgo(60) },
    "90+": { lt: daysAgo(90) },
  };
  return ranges[bucket] || null;
};

const buildCaseReportFilters = (
  currentUser,
  query,
  { dateField = "createdAt" } = {},
) => {
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
    if (dateField === "lastContact") {
      // Prefer lastContactDate; fall back to updatedAt when never contacted.
      filters.push({
        OR: [
          {
            lastContactDate: {
              ...(dateFrom && { gte: dateFrom }),
              ...(dateTo && { lte: dateTo }),
            },
          },
          {
            AND: [
              { lastContactDate: null },
              {
                updatedAt: {
                  ...(dateFrom && { gte: dateFrom }),
                  ...(dateTo && { lte: dateTo }),
                },
              },
            ],
          },
        ],
      });
    } else {
      filters.push({
        createdAt: {
          ...(dateFrom && { gte: dateFrom }),
          ...(dateTo && { lte: dateTo }),
        },
      });
    }
  }

  return filters.length === 0
    ? {}
    : filters.length === 1
      ? filters[0]
      : { AND: filters };
};

const enrichCatalogueItem = (report, generatedAt) => {
  const keys = filterKeys(report);
  return {
    ...report,
    id: report.id,
    reportName: report.reportName || report.name,
    name: report.name,
    category: report.category,
    categoryLabel: report.categoryLabel || report.category,
    reportType: report.reportType,
    reportTypeLabel: report.reportTypeLabel || report.reportType,
    description: report.description,
    keyFields: report.keyFields || [],
    keyDataFields: report.keyDataFields || report.keyFields || [],
    availableFilters: (report.filters || []).map((entry) =>
      typeof entry === "string" ? entry : entry.label || entry.key,
    ),
    filters: report.filters,
    filterKeys: keys,
    permission: report.permission || "ALL_USERS",
    permissionLabel: report.permissionLabel || report.permission || "All Users",
    dataset: report.dataset,
    generated: report.generated || generatedAt.toISOString(),
    lastGeneratedAt: report.generated || generatedAt.toISOString(),
  };
};

const listReports = (query = {}) => {
  const q = applyDateRangePreset(query);
  const page = Number(q.page) || 1;
  const limit = Math.min(Number(q.limit) || 10, 100);
  const generatedAt = new Date();
  let reports = REPORT_DEFINITIONS.map((report) =>
    enrichCatalogueItem(report, generatedAt),
  );

  if (q.search) {
    const search = q.search.toLocaleLowerCase();
    reports = reports.filter((report) => {
      const filterLabels = (report.filters || []).map((entry) =>
        typeof entry === "string" ? entry : entry.label || entry.key,
      );
      return [
        report.name,
        report.reportName,
        report.category,
        report.categoryLabel,
        report.reportType,
        report.reportTypeLabel,
        report.description,
        ...(report.keyFields || []),
        ...(report.keyDataFields || []),
        ...filterLabels,
      ].some((value) =>
        String(value || "")
          .toLocaleLowerCase()
          .includes(search),
      );
    });
  }

  if (q.category) {
    const wanted = normalizeCategoryQuery(q.category);
    reports = reports.filter(
      (report) =>
        report.category.toLocaleLowerCase() ===
          String(wanted).toLocaleLowerCase() ||
        String(report.categoryLabel || "")
          .toLocaleLowerCase()
          .includes(String(q.category).toLocaleLowerCase()),
    );
  }
  if (q.dataset) {
    const dataset = q.dataset.toLocaleLowerCase();
    reports = reports.filter(
      (report) => report.dataset.toLocaleLowerCase() === dataset,
    );
  }
  if (q.reportType) {
    const wanted = normalizeReportTypeQuery(q.reportType);
    reports = reports.filter(
      (report) => report.reportType.toLocaleLowerCase() === wanted,
    );
  }

  if (q.supports) {
    const required = String(q.supports)
      .split(",")
      .map((part) => normalizeSupportsKey(part))
      .filter(Boolean);
    reports = reports.filter((report) => {
      const keys = new Set(filterKeys(report));
      // date affinity: dateFrom or dateTo satisfies "date" support
      if (keys.has("dateFrom") || keys.has("dateTo")) {
        keys.add("dateFrom");
        keys.add("dateTo");
      }
      return required.every((key) => keys.has(key));
    });
  }

  const dateFrom = parseDateBound(q.dateFrom);
  const dateTo = parseDateBound(q.dateTo, true);
  if (dateFrom || dateTo) {
    reports = reports.filter((report) => {
      const generated = new Date(report.generated);
      return (
        (!dateFrom || generated >= dateFrom) && (!dateTo || generated <= dateTo)
      );
    });
  }

  const total = reports.length;
  const skip = (page - 1) * limit;
  return {
    reports: reports.slice(skip, skip + limit),
    items: reports.slice(skip, skip + limit),
    pagination: paginationMeta(page, limit, total),
  };
};

const mapCaseStatusRow = (caseRecord) => {
  const mapped = mapCase(caseRecord);
  const caseManagerName = userDisplayName(mapped.caseManager);
  const neutralName = mapped.assignedNeutral;
  const nextHearing = mapped.hearingDate;
  const lastContact = mapped.lastContactDate;
  const followUp = mapped.followUpDate;
  const caseStatus = mapped.caseStatus?.label || mapped.lifecycleStatus;
  return {
    id: mapped.id,
    caseId: mapped.id,
    caseNumber: mapped.caseNumber,
    caseType: mapped.caseType,
    caseManager: caseManagerName,
    caseManagerName,
    status: caseStatus,
    caseStatus,
    lifecycleStatus: mapped.lifecycleStatus,
    neutral: neutralName,
    neutralName,
    matterName: mapped.matterName || mapped.title,
    disputeType: mapped.disputeCategory?.name || null,
    nextHearing,
    nextHearingAt: nextHearing,
    lastContact,
    lastContactAt: lastContact,
    followUp,
    followUpAt: followUp,
  };
};

const buildParticipantFilterOptions = async (currentUser) => {
  const accessWhere = accessibleCaseWhere(currentUser);
  const cases = await prisma.case.findMany({
    where: {
      isDraft: false,
      ...(Object.keys(accessWhere).length ? accessWhere : {}),
    },
    select: {
      participants: {
        where: {
          accessStatus: "ACTIVE",
          role: { in: ["CASE_MANAGER", "NEUTRAL"] },
        },
        select: {
          role: true,
          userId: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      },
    },
  });

  const caseManagers = new Map();
  const neutrals = new Map();
  for (const c of cases) {
    for (const p of c.participants || []) {
      const id = p.userId || p.user?.id;
      const name = userDisplayName(p.user);
      if (!id || !name) continue;
      if (p.role === "CASE_MANAGER") caseManagers.set(id, { id, name });
      if (p.role === "NEUTRAL") neutrals.set(id, { id, name });
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

const fetchCaseStatusRows = async (currentUser, query) => {
  const q = applyDateRangePreset(query);
  const page = Number(q.page) || 1;
  const limit = Math.min(
    Number(q.limit) || 10,
    String(q.format).toLowerCase() === "csv" ? CSV_EXPORT_MAX_ROWS : 100,
  );
  const where = buildCaseReportFilters(currentUser, q, {
    dateField: "lastContact",
  });
  const [{ cases, total }, filterOptions] = await Promise.all([
    caseRepository.getCases({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updatedAt: "desc" },
    }),
    buildParticipantFilterOptions(currentUser),
  ]);
  return {
    rows: cases.map(mapCaseStatusRow),
    pagination: paginationMeta(page, limit, total),
    filterOptions,
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
      neutralName: row.neutralName,
    })),
    pagination: result.pagination,
    filterOptions: result.filterOptions,
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
  const filters = [];
  if (neutralOnly) {
    filters.push({ role: { contains: "neutral", mode: "insensitive" } });
  }
  if (query.role) {
    filters.push({
      role: { contains: query.role, mode: "insensitive" },
    });
  }
  if (query.state) {
    filters.push({
      state: { contains: query.state, mode: "insensitive" },
    });
  }
  const dateFrom = parseDateBound(query.dateFrom || query.fromDate);
  const dateTo = parseDateBound(query.dateTo || query.toDate, true);
  if (dateFrom || dateTo) {
    filters.push({
      updatedAt: {
        ...(dateFrom && { gte: dateFrom }),
        ...(dateTo && { lte: dateTo }),
      },
    });
  }
  if (query.search) {
    const term = { contains: query.search, mode: "insensitive" };
    filters.push({
      OR: [
        { name: term },
        { email: term },
        { phone: term },
        { role: term },
        { company: term },
        { state: term },
      ],
    });
  }
  const where = filters.length ? { AND: filters } : {};
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
      state: contact.state || null,
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
    ...(caseFilters.length
      ? {
          case:
            caseFilters.length === 1 ? caseFilters[0] : { AND: caseFilters },
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
  const dueDateFilters = [{ dueDate: { lt: now } }];
  if (dateFrom || dateTo) {
    dueDateFilters.push({
      dueDate: {
        ...(dateFrom && { gte: dateFrom }),
        ...(dateTo && { lte: dateTo }),
      },
    });
  }
  if (query.agingBucket) {
    dueDateFilters.push({
      dueDate: agingDueDateRange(query.agingBucket, now),
    });
  }
  where.AND = [...(where.AND || []), ...dueDateFilters];

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

  const rows = invoices.map((invoice) => {
    const paid = (invoice.payments || []).reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    );
    const credited = (invoice.creditNotes || []).reduce(
      (sum, c) => sum + Number(c.amount || 0),
      0,
    );
    const openBalance = Math.max(
      0,
      Number(invoice.amountDue) - paid - credited,
    );
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

  return {
    rows,
    pagination: paginationMeta(page, limit, total),
  };
};

const escapeCsvCell = (value) => {
  if (value == null) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const rowsToCsv = (rows = []) => {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((key) => escapeCsvCell(row[key])).join(","));
  }
  return `${lines.join("\n")}\n`;
};

const getReportData = async (reportId, query, currentUser) => {
  const report = getReportDefinition(reportId);
  if (!report) throw new ApiError(404, "Report not found.");

  const q = applyDateRangePreset({ ...query });
  const isCsv = String(q.format || "").toLowerCase() === "csv";
  if (isCsv) {
    q.page = 1;
    q.limit = CSV_EXPORT_MAX_ROWS;
  }

  let dataset;
  switch (reportId) {
    case "case-status":
      dataset = await fetchCaseStatusRows(currentUser, q);
      break;
    case "dispute-type":
      dataset = await fetchDisputeTypeRows(currentUser, q);
      break;
    case "inquiry-status":
      dataset = await fetchInquiryStatusRows(currentUser, q);
      break;
    case "all-contacts":
      dataset = await fetchContactRows(q);
      break;
    case "neutral-contact":
      dataset = await fetchContactRows(q, { neutralOnly: true });
      break;
    case "hearings-upcoming":
      dataset = await fetchUpcomingHearingsRows(currentUser, q);
      break;
    case "invoices-overdue":
      dataset = await fetchOverdueInvoicesRows(currentUser, q);
      break;
    default:
      throw new ApiError(404, "Report not found.");
  }

  const enrichedReport = enrichCatalogueItem(report, new Date());
  const filterOptions =
    dataset.filterOptions ||
    (["case-status", "dispute-type", "hearings-upcoming", "invoices-overdue"].includes(
      reportId,
    )
      ? await buildParticipantFilterOptions(currentUser)
      : undefined);

  if (isCsv) {
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      format: "csv",
      filename: `${reportId}-${stamp}.csv`,
      csv: rowsToCsv(dataset.rows),
      rowCount: dataset.rows.length,
    };
  }

  return {
    report: enrichedReport,
    rows: dataset.rows,
    pagination: dataset.pagination,
    ...(filterOptions ? { filterOptions } : {}),
  };
};

module.exports = {
  listReports,
  getReportData,
  rowsToCsv,
};
