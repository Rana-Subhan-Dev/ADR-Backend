const representationService = require("../services/representation.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const createRepresentation = asyncHandler(async (req, res) => {
  const result = await representationService.createRepresentation(req.body, req.user);
  return res.status(201).json(new ApiResponse(201, result, "Representation created successfully."));
});

const getRepresentations = asyncHandler(async (req, res) => {
  const result = await representationService.getRepresentations(req.query, req.user);
  return res.status(200).json(new ApiResponse(200, result, "Representations fetched successfully."));
});

const getRepresentationById = asyncHandler(async (req, res) => {
  const result = await representationService.getRepresentationById(req.params.representationId, req.user);
  return res.status(200).json(new ApiResponse(200, result, "Representation fetched successfully."));
});

const updateRepresentation = asyncHandler(async (req, res) => {
  const result = await representationService.updateRepresentation(req.params.representationId, req.body, req.user);
  return res.status(200).json(new ApiResponse(200, result, "Representation updated successfully."));
});

const deleteRepresentation = asyncHandler(async (req, res) => {
  await representationService.deleteRepresentation(req.params.representationId, req.user);
  return res.status(200).json(new ApiResponse(200, null, "Representation deleted successfully."));
});

module.exports = {
  createRepresentation,
  getRepresentations,
  getRepresentationById,
  updateRepresentation,
  deleteRepresentation,
};
