const dashboardService = require("../services/dashboard.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const getOverview = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await dashboardService.getOverview(req.query, req.user),
        "Dashboard overview fetched successfully.",
      ),
    ),
);

module.exports = { getOverview };
