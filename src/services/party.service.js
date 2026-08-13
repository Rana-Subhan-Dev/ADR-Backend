const partyRepository = require("../repositories/party.repository");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");
const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} = require("../constants/party.constants");

const createParty = async (data, currentUser) => {
  await caseService.getCaseById(data.caseId, currentUser);

  return partyRepository.createParty(data);
};

const getParties = async (query, currentUser) => {
  const page = Number(query.page) || DEFAULT_PAGE;
  const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  const { caseId, search, partyType, side } = query;

  await caseService.getCaseById(caseId, currentUser);

  const where = { caseId };

  if (partyType) {
    where.partyType = partyType;
  }

  if (side) {
    where.side = side;
  }

  if (search) {
    const normalizedSearch = search.toUpperCase();

    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { organizationName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];

    if (["CLAIMANT", "RESPONDENT"].includes(normalizedSearch)) {
      where.OR.push({ side: normalizedSearch });
    }
  }

  const skip = (page - 1) * limit;
  const { parties, total } = await partyRepository.getParties({
    skip,
    take: limit,
    where,
  });
  const totalPages = Math.ceil(total / limit);

  return {
    parties,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

const getAuthorizedParty = async (id, currentUser) => {
  const party = await partyRepository.findPartyById(id);

  if (!party) {
    throw new ApiError(404, "Party not found.");
  }

  await caseService.getCaseById(party.caseId, currentUser);

  return party;
};

const updateParty = async (id, data, currentUser) => {
  await getAuthorizedParty(id, currentUser);

  return partyRepository.updateParty(id, data);
};

const deleteParty = async (id, currentUser) => {
  await getAuthorizedParty(id, currentUser);

  return partyRepository.deleteParty(id);
};

module.exports = {
  createParty,
  getParties,
  updateParty,
  deleteParty,
};
