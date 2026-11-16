const conflictsCheckService = require("../services/conflictsCheck.service");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");

const respond = (status, message, handler) =>
  asyncHandler(async (req, res) =>
    res.status(status).json(new ApiResponse(status, await handler(req), message)),
  );

const listNeutrals = respond(
  200,
  "Conflict check neutrals fetched successfully.",
  (req) => conflictsCheckService.listNeutrals(req.user),
);

const createConflictsCheck = respond(
  201,
  "Conflicts check completed successfully.",
  (req) => conflictsCheckService.createConflictsCheck(req.body, req.user),
);

const listConflictsChecks = respond(
  200,
  "Conflicts checks fetched successfully.",
  (req) => conflictsCheckService.listConflictsChecks(req.query, req.user),
);

const getConflictsCheckById = respond(
  200,
  "Conflicts check fetched successfully.",
  (req) => conflictsCheckService.getConflictsCheckById(req.params.id, req.user),
);

const exportConflictsCheckPdf = asyncHandler(async (req, res) => {
  const { buffer, filename } =
    await conflictsCheckService.exportConflictsCheckPdf(
      req.params.id,
      req.user,
    );
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(buffer);
});

module.exports = {
  listNeutrals,
  createConflictsCheck,
  listConflictsChecks,
  getConflictsCheckById,
  exportConflictsCheckPdf,
};
