const {
  TimesheetActivityType,
} = require("@prisma/client");
const prisma = require("../config/prisma");
const {
  resolveDisplayStatus,
  resolveReviewedBy,
  activityTypeLabel,
  activityTypeOptions,
  userDisplayName,
} = require("../utils/timesheetDisplay");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const timesheetListInclude = {
  neutral: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  approvedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  rejectedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  hearing: {
    select: {
      id: true,
      hearingReference: true,
      title: true,
      hearingDate: true,
    },
  },
  case: {
    select: {
      id: true,
      caseNumber: true,
      title: true,
      caseType: true,
      caseTypeLabel: true,
      isDraft: true,
      inquiry: { select: { matterName: true } },
      participants: {
        where: {
          role: "NEUTRAL",
          accessStatus: "ACTIVE",
        },
        select: {
          userId: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      },
      hearings: {
        select: {
          id: true,
          hearingReference: true,
          hearingDate: true,
          title: true,
        },
        orderBy: { hearingDate: "desc" },
      },
    },
  },
};

const buildListRow = (timesheet) => {
  const reviewed = resolveReviewedBy(timesheet);
  const matterName =
    timesheet.case?.inquiry?.matterName || timesheet.case?.title || null;
  const displayStatus = resolveDisplayStatus(timesheet);

  return {
    id: timesheet.id,
    timesheetId: timesheet.id,
    caseId: timesheet.caseId,
    caseNumber: timesheet.case?.caseNumber || null,
    matterName,
    neutralUserId: timesheet.neutralUserId,
    neutralName: userDisplayName(timesheet.neutral),
    entryDate: timesheet.entryDate,
    dateOfWork: timesheet.entryDate,
    activityType: timesheet.activityType,
    activityTypeLabel: activityTypeLabel(timesheet.activityType),
    hearingId: timesheet.hearingId,
    hearingReference: timesheet.hearing?.hearingReference || null,
    hours: timesheet.hours != null ? Number(timesheet.hours) : null,
    // Accounting list badge uses rollup status
    status: displayStatus,
    workflowStatus: timesheet.status,
    approvalStatus: timesheet.approvalStatus,
    description: timesheet.billingNotes || null,
    submittedAt: timesheet.submittedAt,
    reviewedAt: timesheet.reviewedAt,
    decisionDate: timesheet.reviewedAt,
    reviewedByUserId: reviewed.reviewedByUserId,
    reviewedByName: reviewed.reviewedByName,
    decisionBy: reviewed.reviewedByName,
  };
};

const matchesSearch = (row, search) => {
  if (!search) return true;
  const needle = String(search).toLocaleLowerCase();
  const haystack = [
    row.matterName,
    row.neutralName,
    row.id,
    row.timesheetId,
    row.caseNumber,
    row.activityType,
    row.activityTypeLabel,
    row.description,
    row.hearingReference,
  ];
  return haystack.some((value) =>
    String(value || "")
      .toLocaleLowerCase()
      .includes(needle),
  );
};

const buildFilterOptions = async () => {
  const [hearingRows, caseRows] = await Promise.all([
    prisma.neutralTimesheet.findMany({
      where: { hearingId: { not: null }, case: { isDraft: false } },
      distinct: ["hearingId"],
      select: {
        hearingId: true,
        caseId: true,
        hearing: { select: { id: true, hearingReference: true } },
      },
    }),
    prisma.case.findMany({
      where: { isDraft: false },
      select: {
        id: true,
        caseNumber: true,
        title: true,
        caseType: true,
        caseTypeLabel: true,
        inquiry: { select: { matterName: true } },
        participants: {
          where: { role: "NEUTRAL", accessStatus: "ACTIVE" },
          select: {
            userId: true,
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
        hearings: {
          select: {
            id: true,
            hearingReference: true,
            hearingDate: true,
            title: true,
          },
          orderBy: { hearingDate: "desc" },
        },
      },
      orderBy: { caseNumber: "asc" },
    }),
  ]);

  const hearings = hearingRows
    .filter((row) => row.hearing?.id)
    .map((row) => ({
      id: row.hearing.id,
      label: row.hearing.hearingReference,
      caseId: row.caseId,
    }))
    .sort((a, b) =>
      String(a.label).localeCompare(String(b.label), undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

  const cases = caseRows.map((c) => ({
    id: c.id,
    caseNumber: c.caseNumber,
    matterName: c.inquiry?.matterName || c.title,
    caseType: c.caseType,
    caseTypeLabel: c.caseTypeLabel || null,
    neutrals: (c.participants || []).map((p) => ({
      id: p.userId || p.user?.id,
      name: userDisplayName(p.user),
    })),
    hearings: (c.hearings || []).map((h) => ({
      id: h.id,
      label: h.hearingReference,
      hearingDate: h.hearingDate,
      title: h.title || null,
    })),
  }));

  return {
    hearings,
    activityTypes: activityTypeOptions(),
    cases,
  };
};

const listTimesheets = async (query = {}) => {
  const page = Number(query.page) || DEFAULT_PAGE;
  const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  const now = new Date();

  const where = {
    case: { isDraft: false },
  };

  if (query.hearingId) where.hearingId = query.hearingId;
  if (query.activityType) {
    if (!Object.values(TimesheetActivityType).includes(query.activityType)) {
      // Invalid activity filtered to empty via validation normally; keep safe.
      where.activityType = query.activityType;
    } else {
      where.activityType = query.activityType;
    }
  }
  if (query.dateRange) {
    const days = Number(query.dateRange);
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    where.entryDate = { gte: cutoff };
  }

  const timesheets = await prisma.neutralTimesheet.findMany({
    where,
    include: timesheetListInclude,
    orderBy: [{ entryDate: "desc" }, { id: "desc" }],
  });

  let rows = timesheets.map(buildListRow);

  if (query.search) {
    rows = rows.filter((row) => matchesSearch(row, query.search));
  }
  if (query.status) {
    rows = rows.filter((row) => row.status === query.status);
  }

  rows.sort((left, right) => {
    const leftTime = left.entryDate ? new Date(left.entryDate).getTime() : 0;
    const rightTime = right.entryDate ? new Date(right.entryDate).getTime() : 0;
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
  const filterOptions = await buildFilterOptions();

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

module.exports = {
  listTimesheets,
  resolveDisplayStatus,
};
