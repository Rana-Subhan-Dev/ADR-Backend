const participantService = require("../services/participant.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const inviteParticipant = asyncHandler(async (req, res) => {
  const result = await participantService.inviteParticipant(req.params.caseId, req.body, req.user);
  res.status(201).json(new ApiResponse(201, result, "Participant invited successfully."));
});
const getParticipants = asyncHandler(async (req, res) => {
  const result = await participantService.getParticipants(req.params.caseId, req.query, req.user);
  res.status(200).json(new ApiResponse(200, result, "Participants fetched successfully."));
});
const getParticipant = asyncHandler(async (req, res) => {
  const result = await participantService.getParticipant(req.params.caseId, req.params.participantId, req.user);
  res.status(200).json(new ApiResponse(200, result, "Participant fetched successfully."));
});
const updateParticipant = asyncHandler(async (req, res) => {
  const result = await participantService.updateParticipant(req.params.caseId, req.params.participantId, req.body, req.user);
  res.status(200).json(new ApiResponse(200, result, "Participant updated successfully."));
});
const resendInvitation = asyncHandler(async (req, res) => {
  const result = await participantService.resendInvitation(req.params.caseId, req.params.participantId, req.user);
  res.status(200).json(new ApiResponse(200, result, "Invitation resent successfully."));
});
const revokeInvitation = asyncHandler(async (req, res) => {
  const result = await participantService.revokeInvitation(req.params.caseId, req.params.participantId, req.body.reason, req.user);
  res.status(200).json(new ApiResponse(200, result, "Invitation revoked successfully."));
});
const updateAccess = asyncHandler(async (req, res) => {
  const result = await participantService.updateAccess(req.params.caseId, req.params.participantId, req.body.accessStatus, req.user);
  res.status(200).json(new ApiResponse(200, result, "Participant access updated successfully."));
});
const getAvailableNeutrals = asyncHandler(async (req, res) => {
  const result = await participantService.getAvailableNeutrals(req.params.caseId, req.user);
  res.status(200).json(new ApiResponse(200, result, "Available neutrals fetched successfully."));
});
const assignNeutral = asyncHandler(async (req, res) => {
  const result = await participantService.assignNeutral(req.params.caseId, req.body, req.user, {
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });
  res.status(200).json(new ApiResponse(200, result, "Neutral assigned successfully."));
});

module.exports = { inviteParticipant, getParticipants, getParticipant, updateParticipant, resendInvitation, revokeInvitation, updateAccess, getAvailableNeutrals, assignNeutral };
