const reportService = require("../services/report.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const listReports = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        reportService.listReports(req.query),
        "Reports catalogue fetched successfully.",
      ),
    ),
);

const getReport = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await reportService.getReportData(
          req.params.reportId,
          req.query,
          req.user,
        ),
        "Report data fetched successfully.",
      ),
    ),
);

module.exports = {
  listReports,
  getReport,
};
