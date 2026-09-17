const adminService = require("../services/admin.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const respond = (status, message, handler) =>
  asyncHandler(async (req, res) =>
    res
      .status(status)
      .json(new ApiResponse(status, await handler(req), message)),
  );

const getDashboard = respond(
  200,
  "Admin dashboard fetched successfully.",
  (req) => adminService.getDashboard(req.query),
);

const getUsers = respond(200, "Admin users fetched successfully.", (req) =>
  adminService.getAdminUsers(req.query),
);

const getCases = respond(200, "Admin cases fetched successfully.", (req) =>
  adminService.getAdminCases(req.query),
);

const getInvoices = respond(
  200,
  "Admin invoices fetched successfully.",
  (req) => adminService.getAdminInvoices(req.query),
);

module.exports = {
  getDashboard,
  getUsers,
  getCases,
  getInvoices,
};
