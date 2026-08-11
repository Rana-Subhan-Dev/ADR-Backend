const caseService = require("../services/case.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const createCase = asyncHandler(async (req, res) => {
  const result = await caseService.createCase(
    req.body,
    req.user.id
  );

  return res.status(201).json(
    new ApiResponse(
      201,
      result,
      "Case created successfully."
    )
  );
});

const getCases = asyncHandler(async (req, res) => {
  const result = await caseService.getCases(
    req.query,
    req.user
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      result,
      "Cases fetched successfully."
    )
  );
});

const getCaseById = asyncHandler(async (req, res) => {
  const result = await caseService.getCaseById(
    req.params.id,
    req.user
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      result,
      "Case fetched successfully."
    )
  );
});

const updateCase = asyncHandler(async (req, res) => {
  const result = await caseService.updateCase(
    req.params.id,
    req.body,
    req.user
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      result,
      "Case updated successfully."
    )
  );
});

const updateCaseStatus = asyncHandler(async (req, res) => {
  const result = await caseService.updateCaseStatus(
    req.params.id,
    req.body.lifecycleStatus,
    req.user
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      result,
      "Case status updated successfully."
    )
  );
});

module.exports = {
  createCase,
  getCases,
  getCaseById,
  updateCase,
  updateCaseStatus,
};