const prisma = require("../config/prisma");
const {
  FINANCE_ACTIVITY_ACTIONS,
  mapFinanceActivityItem,
  userDisplayName,
} = require("./financeActivity.service");

const paginate = (items, total, page, limit) => ({
  items,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 0,
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1,
  },
});

const endOfUtcDay = (value) => {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
};

const buildWhere = (query) => {
  const where = {};

  if (query.action) where.action = query.action;
  if (query.caseId) where.caseId = query.caseId;
  if (query.invoiceId) where.invoiceId = query.invoiceId;
  if (query.timesheetId) where.timesheetId = query.timesheetId;

  if (query.actingUserId === "SYSTEM") {
    where.isSystem = true;
  } else if (query.actingUserId) {
    where.actingUserId = query.actingUserId;
    where.isSystem = false;
  }

  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  let occurredAt = null;
  if (query.dateRange) {
    const days = Number(query.dateRange);
    if ([7, 30, 90, 365].includes(days)) {
      occurredAt = {
        gte: new Date(today.getTime() - days * 24 * 60 * 60 * 1000),
      };
    }
  }
  if (query.dateFrom || query.dateTo) {
    occurredAt = {
      ...(occurredAt || {}),
      ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
      ...(query.dateTo && { lte: endOfUtcDay(query.dateTo) }),
    };
  }
  if (occurredAt) where.occurredAt = occurredAt;

  if (query.search) {
    const term = String(query.search).trim();
    where.OR = [
      { action: { contains: term, mode: "insensitive" } },
      { caseNumber: { contains: term, mode: "insensitive" } },
      { matterName: { contains: term, mode: "insensitive" } },
      { invoiceNumber: { contains: term, mode: "insensitive" } },
      { timesheetNumber: { contains: term, mode: "insensitive" } },
      { paymentNumber: { contains: term, mode: "insensitive" } },
      { reason: { contains: term, mode: "insensitive" } },
      {
        actingUser: {
          OR: [
            { firstName: { contains: term, mode: "insensitive" } },
            { lastName: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  return where;
};

const listFinanceActivity = async (query = {}) => {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 10, 100);
  const skip = (page - 1) * limit;
  const where = buildWhere(query);

  const [rows, total, actingUsersRaw, casesRaw] = await Promise.all([
    prisma.financeActivityLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      include: {
        actingUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    }),
    prisma.financeActivityLog.count({ where }),
    prisma.financeActivityLog.findMany({
      where: { actingUserId: { not: null }, isSystem: false },
      distinct: ["actingUserId"],
      take: 100,
      orderBy: { occurredAt: "desc" },
      select: {
        actingUserId: true,
        actingUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    }),
    prisma.financeActivityLog.findMany({
      where: { caseId: { not: null } },
      distinct: ["caseId"],
      take: 100,
      orderBy: { occurredAt: "desc" },
      select: {
        caseId: true,
        caseNumber: true,
        matterName: true,
      },
    }),
  ]);

  const actingUsers = [
    { id: "SYSTEM", name: "System" },
    ...actingUsersRaw
      .filter((row) => row.actingUser)
      .map((row) => ({
        id: row.actingUser.id,
        name: userDisplayName(row.actingUser),
      })),
  ];

  const cases = casesRaw
    .filter((row) => row.caseId)
    .map((row) => ({
      id: row.caseId,
      caseNumber: row.caseNumber,
      matterName: row.matterName,
    }));

  return {
    ...paginate(rows.map(mapFinanceActivityItem), total, page, limit),
    filterOptions: {
      actions: FINANCE_ACTIVITY_ACTIONS,
      actingUsers,
      cases,
    },
  };
};

module.exports = {
  listFinanceActivity,
};
