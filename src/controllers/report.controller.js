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

const getReport = asyncHandler(async (req, res) => {
  const data = await reportService.getReportData(
    req.params.reportId,
    req.query,
    req.user,
  );

  if (data.format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${data.filename}"`,
    );
    return res.status(200).send(data.csv);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, data, "Report data fetched successfully."));
});

module.exports = {
  listReports,
  getReport,
};
