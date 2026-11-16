const prisma = require("../config/prisma");

const checkSelect = {
  id: true,
  neutralUserId: true,
  matterName: true,
  searchWindow: true,
  parties: true,
  counsel: true,
  lawFirms: true,
  otherParticipants: true,
  status: true,
  title: true,
  resultLabel: true,
  windowLabel: true,
  namesSearched: true,
  mattersSearched: true,
  mattersTotal: true,
  olderMatchCount: true,
  runAt: true,
  runByUserId: true,
  createdAt: true,
  updatedAt: true,
  neutralUser: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  runByUser: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  matches: {
    orderBy: { checkedAt: "asc" },
    select: {
      id: true,
      caseId: true,
      matterName: true,
      matchedParty: true,
      matchedHistoricalCase: true,
      matchType: true,
      matchSource: true,
      severity: true,
      notes: true,
      checkedAt: true,
      historicalDocumentId: true,
      historicalDocumentName: true,
    },
  },
};

const listSelect = {
  ...checkSelect,
  matches: undefined,
};

const create = (data, tx = prisma) =>
  tx.conflictsCheck.create({
    data,
    select: checkSelect,
  });

const findById = (id, tx = prisma) =>
  tx.conflictsCheck.findUnique({
    where: { id },
    select: checkSelect,
  });

const list = ({ where, skip, take }) =>
  prisma.$transaction([
    prisma.conflictsCheck.findMany({
      where,
      skip,
      take,
      orderBy: [{ runAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        neutralUserId: true,
        matterName: true,
        searchWindow: true,
        status: true,
        title: true,
        resultLabel: true,
        windowLabel: true,
        namesSearched: true,
        mattersSearched: true,
        mattersTotal: true,
        olderMatchCount: true,
        runAt: true,
        runByUserId: true,
        createdAt: true,
        neutralUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        runByUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: { select: { matches: true } },
      },
    }),
    prisma.conflictsCheck.count({ where }),
  ]);

const listActiveNeutrals = () =>
  prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: { name: "NEUTRAL" },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      prefix: true,
    },
  });

module.exports = {
  create,
  findById,
  list,
  listActiveNeutrals,
  checkSelect,
};
