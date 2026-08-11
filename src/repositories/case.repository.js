const prisma = require("../config/prisma");

const CASE_SELECT = {
  id: true,
  caseNumber: true,
  inquiryId: true,
  title: true,
  caseType: true,
  disputeCategoryId: true,
  disputeCategory: {
    select: { id: true, name: true },
  },
  lifecycleStatus: true,
  jurisdiction: true,
  isInternational: true,
  caseValue: true,
  createdAt: true,
  updatedAt: true,

  participants: {
    where: { role: "CASE_MANAGER", isPrimary: true },
    take: 1,
    select: {
      userId: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  },
};

const createCase = async (data, tx = prisma) => {
  return tx.case.create({
    data,
    select: CASE_SELECT,
  });
};

const findCaseById = async (id) => {
  return prisma.case.findUnique({
    where: { id },
    select: CASE_SELECT,
  });
};

const getCases = async ({ skip, take, where, orderBy }) => {
  const [cases, total] = await prisma.$transaction([
    prisma.case.findMany({
      where,
      skip,
      take,
      orderBy,
      select: CASE_SELECT,
    }),

    prisma.case.count({ where }),
  ]);

  return { cases, total };
};

const updateCase = async (id, data) => {
  return prisma.case.update({
    where: { id },
    data,
    select: CASE_SELECT,
  });
};

const findCaseByNumber = async (caseNumber) => {
  return prisma.case.findUnique({
    where: { caseNumber },
    select: { id: true, caseNumber: true },
  });
};

const setPrimaryCaseManager = async (caseId, userId, tx = prisma) => {
  const existing = await tx.caseParticipant.findFirst({
    where: { caseId, role: "CASE_MANAGER", isPrimary: true },
  });

  if (existing) {
    return tx.caseParticipant.update({
      where: { id: existing.id },
      data: { userId },
    });
  }

  return tx.caseParticipant.create({
    data: {
      caseId,
      userId,
      role: "CASE_MANAGER",
      isPrimary: true,
      assignmentType: "ASSIGNED",
      accessStatus: "ACTIVE",
    },
  });
};

const findPrimaryCaseManagerParticipant = async (caseId) => {
  return prisma.caseParticipant.findFirst({
    where: { caseId, role: "CASE_MANAGER", isPrimary: true },
  });
};

module.exports = {
  createCase,
  findCaseById,
  getCases,
  updateCase,
  findCaseByNumber,
  setPrimaryCaseManager,
  findPrimaryCaseManagerParticipant,
};
