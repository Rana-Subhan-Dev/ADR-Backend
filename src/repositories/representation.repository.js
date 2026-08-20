const prisma = require("../config/prisma");

const REPRESENTATION_SELECT = {
  id: true,
  casePartyId: true,
  attorneyId: true,
  designation: true,
  caseParty: {
    select: {
      id: true,
      caseId: true,
      firstName: true,
      lastName: true,
      organizationName: true,
      partyType: true,
      side: true,
    },
  },
  attorney: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      lawFirm: { select: { id: true, name: true } },
    },
  },
  createdAt: true,
  updatedAt: true,
};

const createRepresentation = (data) =>
  prisma.partyAttorneyRepresentation.create({
    data,
    select: REPRESENTATION_SELECT,
  });

const findRepresentationById = (id) =>
  prisma.partyAttorneyRepresentation.findUnique({
    where: { id },
    select: REPRESENTATION_SELECT,
  });

const updateRepresentation = (id, data) =>
  prisma.partyAttorneyRepresentation.update({
    where: { id },
    data,
    select: REPRESENTATION_SELECT,
  });

const deleteRepresentation = (id) =>
  prisma.partyAttorneyRepresentation.delete({
    where: { id },
    select: REPRESENTATION_SELECT,
  });

const getRepresentations = async ({ skip, take, where }) => {
  const [representations, total] = await prisma.$transaction([
    prisma.partyAttorneyRepresentation.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      select: REPRESENTATION_SELECT,
    }),
    prisma.partyAttorneyRepresentation.count({ where }),
  ]);

  return { representations, total };
};

const findAttorneyById = (id) =>
  prisma.attorney.findUnique({
    where: { id },
    select: { id: true },
  });

module.exports = {
  createRepresentation,
  findRepresentationById,
  updateRepresentation,
  deleteRepresentation,
  getRepresentations,
  findAttorneyById,
};
