const practiceLibraryService = require("../services/practiceLibrary.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const listPracticeLibrary = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await practiceLibraryService.listPracticeLibrary(req.query, req.user),
        "Practice library fetched successfully.",
      ),
    ),
);

const getPracticeLibraryItem = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await practiceLibraryService.getPracticeLibraryItem(
          req.params.id,
          req.user,
        ),
        "Practice library item fetched successfully.",
      ),
    ),
);

const createPracticeLibraryItem = asyncHandler(async (req, res) =>
  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        await practiceLibraryService.createPracticeLibraryItem(
          req.body,
          req.file,
          req.user,
        ),
        "Practice library item created successfully.",
      ),
    ),
);

module.exports = {
  listPracticeLibrary,
  getPracticeLibraryItem,
  createPracticeLibraryItem,
};
