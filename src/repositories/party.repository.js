const prisma = require("../config/prisma");

const PARTY_SELECT = {
  id: true,
  caseId: true,
  partyType: true,
  side: true,
  firstName: true,
  lastName: true,
  organizationName: true,
  email: true,
  phone: true,
  streetAddress: true,
  city: true,
  state: true,
  postalCode: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
};

const createParty = async (data) => {
  return prisma.caseParty.create({
    data,
    select: PARTY_SELECT,
  });
};

const getParties = async ({ skip, take, where }) => {
  const [parties, total] = await prisma.$transaction([
    prisma.caseParty.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      select: PARTY_SELECT,
    }),
    prisma.caseParty.count({ where }),
  ]);

  return { parties, total };
};

const findPartyById = async (id) => {
  return prisma.caseParty.findUnique({
    where: { id },
    select: PARTY_SELECT,
  });
};

const updateParty = async (id, data) => {
  return prisma.caseParty.update({
    where: { id },
    data,
    select: PARTY_SELECT,
  });
};

const deleteParty = async (id) => {
  return prisma.caseParty.delete({
    where: { id },
    select: PARTY_SELECT,
  });
};

module.exports = {
  createParty,
  getParties,
  findPartyById,
  updateParty,
  deleteParty,
};
