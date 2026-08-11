const authService = require("../services/auth.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const inviteUser = asyncHandler(async (req, res) => {
  const result = await authService.inviteUser(req.body, req.user.id);

  return res
    .status(201)
    .json(new ApiResponse(201, result, "Invitation sent successfully."));
});

const acceptInvitation = asyncHandler(async (req, res) => {
  const result = await authService.acceptInvitation(req.body);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Invitation accepted successfully."));
});

const signIn = asyncHandler(async (req, res) => {
  const result = await authService.signIn(req.body, {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "User signed in successfully."));
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body.email, {
    ipAddress: req.ip,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(200, result, "Password reset request processed successfully.")
    );
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body);

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Password has been reset successfully."));
});

module.exports = {
  inviteUser,
  acceptInvitation,
  signIn,
  forgotPassword,
  resetPassword,
};
