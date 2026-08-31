const prisma = require("../config/prisma");

const LAW_FIRM_SELECT = {
  id: true,
  name: true,
  address: true,
  phone: true,
  website: true,
  _count: { select: { attorneys: true } },
  createdAt: true,
  updatedAt: true,
};

const ATTORNEY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  lawFirmId: true,
  lawFirm: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
};

const createLawFirm = (data) =>
  prisma.lawFirm.create({ data, select: LAW_FIRM_SELECT });
const findLawFirmById = (id) =>
  prisma.lawFirm.findUnique({ where: { id }, select: LAW_FIRM_SELECT });
const findLawFirm = (where) =>
  prisma.lawFirm.findFirst({ where, select: LAW_FIRM_SELECT });
const updateLawFirm = (id, data) =>
  prisma.lawFirm.update({ where: { id }, data, select: LAW_FIRM_SELECT });
const deleteLawFirm = (id) =>
  prisma.lawFirm.delete({ where: { id }, select: LAW_FIRM_SELECT });

const getLawFirms = async ({ skip, take, where }) => {
  const [lawFirms, total] = await prisma.$transaction([
    prisma.lawFirm.findMany({
      where,
      skip,
      take,
      orderBy: { name: "asc" },
      select: LAW_FIRM_SELECT,
    }),
    prisma.lawFirm.count({ where }),
  ]);
  return { lawFirms, total };
};

const createAttorneyWithRepresentation = async (
  attorneyData,
  representationData,
) => {
  return prisma.$transaction(async (tx) => {
    const attorney = await tx.attorney.create({
      data: attorneyData,
      select: ATTORNEY_SELECT,
    });
    const representation = await tx.partyAttorneyRepresentation.create({
      data: { attorneyId: attorney.id, ...representationData },
      select: {
        id: true,
        casePartyId: true,
        designation: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { ...attorney, representation };
  });
};

const findAttorneyById = (id) =>
  prisma.attorney.findUnique({ where: { id }, select: ATTORNEY_SELECT });
const updateAttorney = (id, data) =>
  prisma.attorney.update({ where: { id }, data, select: ATTORNEY_SELECT });
const deleteAttorney = (id) =>
  prisma.attorney.delete({ where: { id }, select: ATTORNEY_SELECT });

const getAttorneys = async ({ skip, take, where }) => {
  const [attorneys, total] = await prisma.$transaction([
    prisma.attorney.findMany({
      where,
      skip,
      take,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: ATTORNEY_SELECT,
    }),
    prisma.attorney.count({ where }),
  ]);
  return { attorneys, total };
};

const findRepresentation = (attorneyId, caseId) =>
  prisma.partyAttorneyRepresentation.findFirst({
    where: { attorneyId, caseParty: { caseId } },
    select: {
      id: true,
      casePartyId: true,
      designation: true,
      caseParty: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          organizationName: true,
          partyType: true,
          side: true,
        },
      },
    },
  });

const findAttorneyCaseIds = (attorneyId) =>
  prisma.partyAttorneyRepresentation.findMany({
    where: { attorneyId },
    select: { caseParty: { select: { caseId: true } } },
  });

module.exports = {
  createLawFirm,
  findLawFirmById,
  findLawFirm,
  updateLawFirm,
  deleteLawFirm,
  getLawFirms,
  createAttorneyWithRepresentation,
  findAttorneyById,
  updateAttorney,
  deleteAttorney,
  getAttorneys,
  findRepresentation,
  findAttorneyCaseIds,
};
