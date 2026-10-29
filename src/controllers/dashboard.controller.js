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

const getLawyerDashboard = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await dashboardService.getLawyerDashboard(req.query, req.user),
        "Lawyer dashboard fetched successfully.",
      ),
    ),
);

const getCaseManagerDashboard = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await dashboardService.getCaseManagerDashboard(req.query, req.user),
        "Case manager dashboard fetched successfully.",
      ),
    ),
);

const getClientDashboard = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await dashboardService.getClientDashboard(req.query, req.user),
        "Client dashboard fetched successfully.",
      ),
    ),
);

module.exports = {
  getOverview,
  getLawyerDashboard,
  getCaseManagerDashboard,
  getClientDashboard,
};
