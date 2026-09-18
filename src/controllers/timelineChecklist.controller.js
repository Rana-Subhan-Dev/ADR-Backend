const timelineChecklistService = require("../services/timelineChecklist.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const respond = (status, message, handler) =>
  asyncHandler(async (req, res) =>
    res
      .status(status)
      .json(new ApiResponse(status, await handler(req), message)),
  );

const getTimeline = respond(200, "Case timeline fetched successfully.", (req) =>
  timelineChecklistService.getTimeline(req.params.caseId, req.query, req.user),
);

const getChecklistItems = respond(
  200,
  "Checklist items fetched successfully.",
  (req) =>
    timelineChecklistService.getChecklistItems(
      req.params.caseId,
      req.query,
      req.user,
    ),
);

const completeChecklistItem = respond(
  200,
  "Checklist item completed successfully.",
  (req) =>
    timelineChecklistService.completeChecklistItem(
      req.params.caseId,
      req.params.itemId,
      req.user,
    ),
);

const markChecklistItemNotApplicable = respond(
  200,
  "Checklist item marked not applicable.",
  (req) =>
    timelineChecklistService.markChecklistItemNotApplicable(
      req.params.caseId,
      req.params.itemId,
      req.user,
    ),
);

module.exports = {
  getTimeline,
  getChecklistItems,
  completeChecklistItem,
  markChecklistItemNotApplicable,
};
