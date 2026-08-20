const hearingService = require("../services/hearing.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const checkAvailability = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await hearingService.checkAvailability(
          req.params.caseId,
          req.query,
          req.user,
        ),
        "Hearing availability checked successfully.",
      ),
    ),
);
const getAvailableSlots = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await hearingService.getAvailableSlots(
          req.params.caseId,
          req.query,
          req.user,
        ),
        "Available hearing slots fetched successfully.",
      ),
    ),
);
const scheduleHearing = asyncHandler(async (req, res) =>
  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        await hearingService.scheduleHearing(
          req.params.caseId,
          req.body,
          req.user,
        ),
        "Hearing scheduled successfully.",
      ),
    ),
);
const getHearings = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await hearingService.getHearings(
          req.params.caseId,
          req.query,
          req.user,
        ),
        "Hearings fetched successfully.",
      ),
    ),
);
const getHearing = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await hearingService.getHearing(
          req.params.caseId,
          req.params.hearingId,
          req.user,
        ),
        "Hearing fetched successfully.",
      ),
    ),
);
const updateHearing = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await hearingService.updateHearing(
          req.params.caseId,
          req.params.hearingId,
          req.body,
          req.user,
        ),
        "Hearing updated successfully.",
      ),
    ),
);
const rescheduleHearing = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await hearingService.rescheduleHearing(
          req.params.caseId,
          req.params.hearingId,
          req.body,
          req.user,
        ),
        "Hearing rescheduled successfully.",
      ),
    ),
);
const cancelHearing = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await hearingService.cancelHearing(
          req.params.caseId,
          req.params.hearingId,
          req.body.reason,
          req.user,
        ),
        "Hearing cancelled successfully.",
      ),
    ),
);

module.exports = {
  checkAvailability,
  getAvailableSlots,
  scheduleHearing,
  getHearings,
  getHearing,
  updateHearing,
  rescheduleHearing,
  cancelHearing,
};
