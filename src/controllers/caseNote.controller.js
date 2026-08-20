const caseNoteService = require("../services/caseNote.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const createCaseNote = asyncHandler(async (req, res) =>
  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        await caseNoteService.createCaseNote(
          req.params.caseId,
          req.body,
          req.user,
        ),
        "Case note created successfully.",
      ),
    ),
);

const getCaseNotes = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await caseNoteService.getCaseNotes(
          req.params.caseId,
          req.query,
          req.user,
        ),
        "Case notes fetched successfully.",
      ),
    ),
);

const getCaseNote = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await caseNoteService.getCaseNote(
          req.params.caseId,
          req.params.noteId,
          req.user,
        ),
        "Case note fetched successfully.",
      ),
    ),
);

const updateCaseNote = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await caseNoteService.updateCaseNote(
          req.params.caseId,
          req.params.noteId,
          req.body,
          req.user,
        ),
        "Case note updated successfully.",
      ),
    ),
);

const deleteCaseNote = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await caseNoteService.deleteCaseNote(
          req.params.caseId,
          req.params.noteId,
          req.user,
        ),
        "Case note deleted successfully.",
      ),
    ),
);

module.exports = {
  createCaseNote,
  getCaseNotes,
  getCaseNote,
  updateCaseNote,
  deleteCaseNote,
};
