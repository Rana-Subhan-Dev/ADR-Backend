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

const createChecklistItem = respond(
  201,
  "Checklist item created successfully.",
  (req) =>
    timelineChecklistService.createChecklistItem(
      req.params.caseId,
      req.body,
      req.user,
    ),
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

const getChecklistItem = respond(
  200,
  "Checklist item fetched successfully.",
  (req) =>
    timelineChecklistService.getChecklistItem(
      req.params.caseId,
      req.params.itemId,
      req.user,
    ),
);

const updateChecklistItem = respond(
  200,
  "Checklist item updated successfully.",
  (req) =>
    timelineChecklistService.updateChecklistItem(
      req.params.caseId,
      req.params.itemId,
      req.body,
      req.user,
    ),
);

const deleteChecklistItem = respond(
  200,
  "Checklist item deleted successfully.",
  (req) =>
    timelineChecklistService.deleteChecklistItem(
      req.params.caseId,
      req.params.itemId,
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

const reopenChecklistItem = respond(
  200,
  "Checklist item reopened successfully.",
  (req) =>
    timelineChecklistService.reopenChecklistItem(
      req.params.caseId,
      req.params.itemId,
      req.user,
    ),
);

module.exports = {
  getTimeline,
  createChecklistItem,
  getChecklistItems,
  getChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  completeChecklistItem,
  reopenChecklistItem,
};
