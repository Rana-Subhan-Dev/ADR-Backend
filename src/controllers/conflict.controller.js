const conflictService = require("../services/conflict.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const getConflicts = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await conflictService.getConflicts(req.params.id, req.user),
        "Conflicts report fetched successfully.",
      ),
    ),
);

const exportConflicts = asyncHandler(async (req, res) => {
  const file = await conflictService.exportConflictsCsv(req.params.id, req.user);
  res.setHeader("Content-Type", file.contentType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${file.filename}"`,
  );
  return res.status(200).send(file.content);
});

module.exports = {
  getConflicts,
  exportConflicts,
};
