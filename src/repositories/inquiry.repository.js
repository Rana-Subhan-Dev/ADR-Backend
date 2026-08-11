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
  caseType: true,
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
  convertedAt: true,
  convertedCase: {
    select: { id: true, caseNumber: true },
  },
  createdAt: true,
  updatedAt: true,
};

const createInquiry = async (data) => {
  return prisma.inquiry.create({
    data,
    select: INQUIRY_SELECT,
  });
};

const findInquiryById = async (id) => {
  return prisma.inquiry.findUnique({
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

const updateInquiry = async (id, data) => {
  return prisma.inquiry.update({
    where: { id },
    data,
    select: INQUIRY_SELECT,
  });
};

const markInquiryConverted = async (id, tx = prisma) => {
  return tx.inquiry.update({
    where: { id },
    data: { status: "CONVERTED", convertedAt: new Date() },
  });
};

module.exports = {
  createInquiry,
  findInquiryById,
  getInquiries,
  updateInquiry,
  markInquiryConverted,
};
