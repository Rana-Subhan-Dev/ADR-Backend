const prisma = require("../config/prisma");
const attorneyLawFirmRepository = require("../repositories/attorneyLawFirm.repository");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");
const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} = require("../constants/attorneyLawFirm.constants");

const getPagination = (query) => {
  const page = Number(query.page) || DEFAULT_PAGE;
  const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  return { page, limit, skip: (page - 1) * limit };
};

const buildPagination = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
};

const createLawFirm = (data) => attorneyLawFirmRepository.createLawFirm(data);

const getLawFirms = async (query) => {
  const { page, limit, skip } = getPagination(query);
  const where = query.search
    ? { name: { contains: query.search, mode: "insensitive" } }
    : {};
  const { lawFirms, total } = await attorneyLawFirmRepository.getLawFirms({
    skip,
    take: limit,
    where,
  });
  return { lawFirms, pagination: buildPagination(page, limit, total) };
};

const getLawFirmById = async (id) => {
  const lawFirm = await attorneyLawFirmRepository.findLawFirmById(id);
  if (!lawFirm) throw new ApiError(404, "Law firm not found.");
  return lawFirm;
};

const updateLawFirm = async (id, data) => {
  await getLawFirmById(id);
  return attorneyLawFirmRepository.updateLawFirm(id, data);
};

const deleteLawFirm = async (id) => {
  await getLawFirmById(id);
  return attorneyLawFirmRepository.deleteLawFirm(id);
};

const getAuthorizedCaseParty = async (partyId, caseId, currentUser) => {
  const party = await prisma.caseParty.findUnique({
    where: { id: partyId },
    select: { id: true, caseId: true },
  });
  if (!party || party.caseId !== caseId) {
    throw new ApiError(404, "Represented party was not found in this case.");
  }
  await caseService.getCaseById(caseId, currentUser);
  return party;
};

const createAttorney = async (data, currentUser) => {
  const { caseId, representedPartyId, designation, ...attorneyData } = data;
  await getAuthorizedCaseParty(representedPartyId, caseId, currentUser);
  if (attorneyData.lawFirmId) await getLawFirmById(attorneyData.lawFirmId);
  return attorneyLawFirmRepository.createAttorneyWithRepresentation(
    attorneyData,
    {
      casePartyId: representedPartyId,
      designation,
    },
  );
};

const mapAttorneyForCase = async (attorney, caseId) => ({
  ...attorney,
  representation: await attorneyLawFirmRepository.findRepresentation(
    attorney.id,
    caseId,
  ),
});

const getAttorneys = async (query, currentUser) => {
  const { caseId, search, lawFirmId, designation } = query;
  await caseService.getCaseById(caseId, currentUser);
  const { page, limit, skip } = getPagination(query);
  const representationWhere = { caseParty: { caseId } };
  if (designation) representationWhere.designation = designation;
  const where = { representations: { some: representationWhere } };
  if (lawFirmId) where.lawFirmId = lawFirmId;
  if (search) {
    where.AND = [
      {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { lawFirm: { name: { contains: search, mode: "insensitive" } } },
        ],
      },
    ];
  }
  const { attorneys, total } = await attorneyLawFirmRepository.getAttorneys({
    skip,
    take: limit,
    where,
  });
  return {
    attorneys: await Promise.all(
      attorneys.map((attorney) => mapAttorneyForCase(attorney, caseId)),
    ),
    pagination: buildPagination(page, limit, total),
  };
};

const getAttorneyById = async (id, caseId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const attorney = await attorneyLawFirmRepository.findAttorneyById(id);
  if (!attorney) throw new ApiError(404, "Attorney not found.");
  const representation = await attorneyLawFirmRepository.findRepresentation(
    id,
    caseId,
  );
  if (!representation)
    throw new ApiError(404, "Attorney is not linked to this case.");
  return { ...attorney, representation };
};

const updateAttorney = async (id, data, currentUser) => {
  const attorney = await attorneyLawFirmRepository.findAttorneyById(id);
  if (!attorney) throw new ApiError(404, "Attorney not found.");
  const caseIds = await attorneyLawFirmRepository.findAttorneyCaseIds(id);
  await Promise.all(
    [...new Set(caseIds.map((item) => item.caseParty.caseId))].map((caseId) =>
      caseService.getCaseById(caseId, currentUser),
    ),
  );
  if (data.lawFirmId) await getLawFirmById(data.lawFirmId);
  return attorneyLawFirmRepository.updateAttorney(id, data);
};

const deleteAttorney = async (id, currentUser) => {
  const attorney = await attorneyLawFirmRepository.findAttorneyById(id);
  if (!attorney) throw new ApiError(404, "Attorney not found.");
  const caseIds = await attorneyLawFirmRepository.findAttorneyCaseIds(id);
  await Promise.all(
    [...new Set(caseIds.map((item) => item.caseParty.caseId))].map((caseId) =>
      caseService.getCaseById(caseId, currentUser),
    ),
  );
  return attorneyLawFirmRepository.deleteAttorney(id);
};

module.exports = {
  createLawFirm,
  getLawFirms,
  getLawFirmById,
  updateLawFirm,
  deleteLawFirm,
  createAttorney,
  getAttorneys,
  getAttorneyById,
  updateAttorney,
  deleteAttorney,
};
