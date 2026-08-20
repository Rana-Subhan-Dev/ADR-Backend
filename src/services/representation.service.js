const prisma = require("../config/prisma");
const representationRepository = require("../repositories/representation.repository");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");
const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} = require("../constants/representation.constants");

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

const getRepresentationTypeDesignation = (caseParty) =>
  caseParty.side === "CLAIMANT"
    ? "REPRESENTS_CLAIMANT"
    : "REPRESENTS_RESPONDENT";

const mapRepresentation = (representation) => ({
  ...representation,
  role: representation.designation,
  representationTypeDesignation: getRepresentationTypeDesignation(
    representation.caseParty,
  ),
});

const getAuthorizedCaseParty = async (casePartyId, caseId, currentUser) => {
  const caseParty = await prisma.caseParty.findUnique({
    where: { id: casePartyId },
    select: { id: true, caseId: true },
  });

  if (!caseParty || caseParty.caseId !== caseId) {
    throw new ApiError(404, "Party was not found in this case.");
  }

  await caseService.getCaseById(caseId, currentUser);
  return caseParty;
};

const getAuthorizedRepresentation = async (id, currentUser) => {
  const representation =
    await representationRepository.findRepresentationById(id);

  if (!representation) {
    throw new ApiError(404, "Representation not found.");
  }

  await caseService.getCaseById(representation.caseParty.caseId, currentUser);
  return representation;
};

const createRepresentation = async (data, currentUser) => {
  const { caseId, casePartyId, attorneyId, role } = data;
  await getAuthorizedCaseParty(casePartyId, caseId, currentUser);

  const attorney = await representationRepository.findAttorneyById(attorneyId);
  if (!attorney) {
    throw new ApiError(404, "Attorney not found.");
  }

  const representation = await representationRepository.createRepresentation({
    casePartyId,
    attorneyId,
    designation: role,
  });
  return mapRepresentation(representation);
};

const getRepresentations = async (query, currentUser) => {
  const { caseId, casePartyId, attorneyId, role } = query;
  await caseService.getCaseById(caseId, currentUser);
  const { page, limit, skip } = getPagination(query);
  const where = { caseParty: { caseId } };

  if (casePartyId) where.casePartyId = casePartyId;
  if (attorneyId) where.attorneyId = attorneyId;
  if (role) where.designation = role;

  const { representations, total } =
    await representationRepository.getRepresentations({
      skip,
      take: limit,
      where,
    });

  return {
    representations: representations.map(mapRepresentation),
    pagination: buildPagination(page, limit, total),
  };
};

const getRepresentationById = async (id, currentUser) =>
  mapRepresentation(await getAuthorizedRepresentation(id, currentUser));

const updateRepresentation = async (id, data, currentUser) => {
  await getAuthorizedRepresentation(id, currentUser);
  const representation = await representationRepository.updateRepresentation(
    id,
    {
      designation: data.role,
    },
  );
  return mapRepresentation(representation);
};

const deleteRepresentation = async (id, currentUser) => {
  await getAuthorizedRepresentation(id, currentUser);
  return representationRepository.deleteRepresentation(id);
};

module.exports = {
  createRepresentation,
  getRepresentations,
  getRepresentationById,
  updateRepresentation,
  deleteRepresentation,
};
