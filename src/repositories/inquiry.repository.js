const prisma = require("../config/prisma");

const INQUIRY_SELECT = {
  id: true,
  inquiryDate: true,
  matterName: true,
  initialContactName: true,
  inquiryContactType: true,
  fromFirm: true,
  counselFor: true,
  contactEmail: true,
  contactPhone: true,
  contactCellPhone: true,
  clientReference: true,
  caseType: true,
  caseTypeLabel: true,
  disputeCategoryId: true,
  disputeCategory: {
    select: { id: true, name: true },
  },
  locationJurisdiction: true,
  daysRequested: true,
  timeFrameRequested: true,
  sourceOfInquiry: true,
  referredBy: true,
  comments: true,
  isInternational: true,
  isDraft: true,
  status: true,
  preliminaryCaseManagerId: true,
  preliminaryCaseManager: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  preliminaryNeutrals: {
    select: {
      userId: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  },
  convertedAt: true,
  convertedCase: {
    select: { id: true, caseNumber: true },
  },
  createdAt: true,
  updatedAt: true,
};

const createInquiry = async (data, tx = prisma) => {
  return tx.inquiry.create({
    data,
    select: INQUIRY_SELECT,
  });
};

const findInquiryById = async (id, tx = prisma) => {
  return tx.inquiry.findUnique({
    where: { id },
    select: INQUIRY_SELECT,
  });
};

const getInquiries = async ({ skip, take, where, orderBy }) => {
  const [inquiries, total] = await prisma.$transaction([
    prisma.inquiry.findMany({
      where,
      skip,
      take,
      orderBy,
      select: INQUIRY_SELECT,
    }),
    prisma.inquiry.count({ where }),
  ]);

  return { inquiries, total };
};

const updateInquiry = async (id, data, tx = prisma) => {
  return tx.inquiry.update({
    where: { id },
    data,
    select: INQUIRY_SELECT,
  });
};

const replacePreliminaryNeutrals = async (inquiryId, userIds = [], tx = prisma) => {
  await tx.inquiryPreliminaryNeutral.deleteMany({ where: { inquiryId } });
  if (!userIds.length) return [];
  await tx.inquiryPreliminaryNeutral.createMany({
    data: userIds.map((userId) => ({ inquiryId, userId })),
    skipDuplicates: true,
  });
  return tx.inquiryPreliminaryNeutral.findMany({
    where: { inquiryId },
    select: {
      userId: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });
};

const markInquiryConverted = async (id, tx = prisma) => {
  return tx.inquiry.update({
    where: { id },
    data: { status: "CONVERTED", convertedAt: new Date(), isDraft: false },
  });
};

const findOrCreateDisputeCategoryByName = async (name, tx = prisma) => {
  if (!name || !String(name).trim()) return null;
  const trimmed = String(name).trim();
  const existing = await tx.disputeCategory.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing;
  return tx.disputeCategory.create({
    data: { name: trimmed, isActive: true },
  });
};

module.exports = {
  INQUIRY_SELECT,
  createInquiry,
  findInquiryById,
  getInquiries,
  updateInquiry,
  replacePreliminaryNeutrals,
  markInquiryConverted,
  findOrCreateDisputeCategoryByName,
};
