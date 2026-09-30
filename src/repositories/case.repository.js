const prisma = require("../config/prisma");

const CASE_SELECT = {
  id: true,
  caseNumber: true,
  inquiryId: true,
  title: true,
  summary: true,
  caseType: true,
  caseTypeLabel: true,
  disputeCategoryId: true,
  disputeCategory: {
    select: { id: true, name: true },
  },
  disputePartyStructure: true,
  lifecycleStatus: true,
  isDraft: true,
  stageId: true,
  stage: {
    select: { id: true, name: true, sortOrder: true },
  },
  caseValue: true,
  feeScheduleStatus: true,
  conflictCheckStatus: true,
  isInternational: true,
  lastContactDate: true,
  followUpDate: true,
  nextStep: true,
  jurisdiction: true,
  referralSource: true,
  primaryCommunicationMethod: true,
  notifyOnHearingScheduled: true,
  notifyOnDocumentUploaded: true,
  notifyOnCaseUpdate: true,
  notifyOnDocuSignSent: true,
  closedAt: true,
  closureSummary: true,
  reopenReason: true,
  createdAt: true,
  updatedAt: true,

  inquiry: {
    select: {
      id: true,
      inquiryDate: true,
      matterName: true,
      status: true,
      contactCellPhone: true,
      clientReference: true,
      caseTypeLabel: true,
    },
  },

  revenueMilestones: {
    orderBy: { sequence: "asc" },
    take: 2,
    select: {
      id: true,
      sequence: true,
      estimatedAmount: true,
      revenueDate: true,
      status: true,
    },
  },

  hearings: {
    where: {
      hearingStatus: { notIn: ["CANCELLED"] },
      hearingDate: { not: null },
    },
    orderBy: { hearingDate: "asc" },
    take: 5,
    select: {
      id: true,
      hearingDate: true,
      hearingStatus: true,
      title: true,
    },
  },

  participants: {
    where: {
      OR: [
        { role: "CASE_MANAGER", isPrimary: true },
        { role: "NEUTRAL", accessStatus: "ACTIVE" },
      ],
    },
    select: {
      userId: true,
      role: true,
      isPrimary: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  },

  parties: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      organizationName: true,
      side: true,
      partyType: true,
      representations: {
        select: {
          attorney: {
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

  invoices: {
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      invoiceStatus: true,
      paymentStatus: true,
      invoiceNumber: true,
    },
  },

  billingConfiguration: {
    select: {
      id: true,
      billingMode: true,
      billingType: true,
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
  CASE_SELECT,
  createCase,
  findCaseById,
  getCases,
  updateCase,
  findCaseByNumber,
  setPrimaryCaseManager,
  findPrimaryCaseManagerParticipant,
};
