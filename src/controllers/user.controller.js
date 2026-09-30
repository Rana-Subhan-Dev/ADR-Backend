const userService = require("../services/user.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");
const { sanitizeUser } = require("../utils/auth");

/** Current session profile for Case Manager shell / profile screens (P11). */
const getCurrentUser = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        sanitizeUser(req.user),
        "Current user fetched successfully.",
      ),
    ),
);

const updateCurrentUser = asyncHandler(async (req, res) => {
  const result = await userService.updateCurrentUserProfile(
    req.user.id,
    req.body,
  );

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        sanitizeUser(result),
        "Profile updated successfully.",
      ),
    );
});

const getUsers = asyncHandler(async (req, res) => {
  const result = await userService.getUsers(req.query);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Users fetched successfully."));
});

const getUserById = asyncHandler(async (req, res) => {
  const result = await userService.getUserById(req.params.id);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "User fetched successfully."));
});

const updateUser = asyncHandler(async (req, res) => {
  const result = await userService.updateUser(req.params.id, req.body);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "User updated successfully."));
});

const updateUserStatus = asyncHandler(async (req, res) => {
  const result = await userService.updateUserStatus({
    userId: req.params.id,
    status: req.body.status,
    reason: req.body.reason,
    actingUserId: req.user.id,
    actingUserRole: req.user.role?.name,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "User status updated successfully."));
});

module.exports = {
  getCurrentUser,
  updateCurrentUser,
  getUsers,
  getUserById,
  updateUser,
  updateUserStatus,
};
