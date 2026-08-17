const attorneyLawFirmService = require("../services/attorneyLawFirm.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const createLawFirm = asyncHandler(async (req, res) => {
  const result = await attorneyLawFirmService.createLawFirm(req.body);
  return res.status(201).json(new ApiResponse(201, result, "Law firm added successfully."));
});

const getLawFirms = asyncHandler(async (req, res) => {
  const result = await attorneyLawFirmService.getLawFirms(req.query);
  return res.status(200).json(new ApiResponse(200, result, "Law firms fetched successfully."));
});

const getLawFirmById = asyncHandler(async (req, res) => {
  const result = await attorneyLawFirmService.getLawFirmById(req.params.lawFirmId);
  return res.status(200).json(new ApiResponse(200, result, "Law firm fetched successfully."));
});

const updateLawFirm = asyncHandler(async (req, res) => {
  const result = await attorneyLawFirmService.updateLawFirm(req.params.lawFirmId, req.body);
  return res.status(200).json(new ApiResponse(200, result, "Law firm updated successfully."));
});

const deleteLawFirm = asyncHandler(async (req, res) => {
  await attorneyLawFirmService.deleteLawFirm(req.params.lawFirmId);
  return res.status(200).json(new ApiResponse(200, null, "Law firm deleted successfully."));
});

const createAttorney = asyncHandler(async (req, res) => {
  const result = await attorneyLawFirmService.createAttorney(req.body, req.user);
  return res.status(201).json(new ApiResponse(201, result, "Attorney added successfully."));
});

const getAttorneys = asyncHandler(async (req, res) => {
  const result = await attorneyLawFirmService.getAttorneys(req.query, req.user);
  return res.status(200).json(new ApiResponse(200, result, "Attorneys fetched successfully."));
});

const getAttorneyById = asyncHandler(async (req, res) => {
  const result = await attorneyLawFirmService.getAttorneyById(req.params.attorneyId, req.query.caseId, req.user);
  return res.status(200).json(new ApiResponse(200, result, "Attorney fetched successfully."));
});

const updateAttorney = asyncHandler(async (req, res) => {
  const result = await attorneyLawFirmService.updateAttorney(req.params.attorneyId, req.body, req.user);
  return res.status(200).json(new ApiResponse(200, result, "Attorney updated successfully."));
});

const deleteAttorney = asyncHandler(async (req, res) => {
  await attorneyLawFirmService.deleteAttorney(req.params.attorneyId, req.user);
  return res.status(200).json(new ApiResponse(200, null, "Attorney deleted successfully."));
});

module.exports = { createLawFirm, getLawFirms, getLawFirmById, updateLawFirm, deleteLawFirm, createAttorney, getAttorneys, getAttorneyById, updateAttorney, deleteAttorney };
