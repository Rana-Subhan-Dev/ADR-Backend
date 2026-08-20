const partyService = require("../services/party.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const createParty = asyncHandler(async (req, res) => {
  const result = await partyService.createParty(req.body, req.user);

  return res
    .status(201)
    .json(new ApiResponse(201, result, "Party added successfully."));
});

const getParties = asyncHandler(async (req, res) => {
  const result = await partyService.getParties(req.query, req.user);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Parties fetched successfully."));
});

const updateParty = asyncHandler(async (req, res) => {
  const result = await partyService.updateParty(
    req.params.id,
    req.body,
    req.user,
  );

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Party updated successfully."));
});

const deleteParty = asyncHandler(async (req, res) => {
  await partyService.deleteParty(req.params.id, req.user);

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Party deleted successfully."));
});

module.exports = {
  createParty,
  getParties,
  updateParty,
  deleteParty,
};
