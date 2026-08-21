const timesheetService = require("../services/timesheet.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const respond = (status, message, handler) =>
  asyncHandler(async (req, res) =>
    res
      .status(status)
      .json(new ApiResponse(status, await handler(req), message)),
  );

const createTimesheet = respond(
  201,
  "Timesheet entry created successfully.",
  (req) =>
    timesheetService.createTimesheet(req.params.caseId, req.body, req.user),
);
const getTimesheets = respond(
  200,
  "Timesheet entries fetched successfully.",
  (req) =>
    timesheetService.getTimesheets(req.params.caseId, req.query, req.user),
);
const getTimesheet = respond(
  200,
  "Timesheet entry fetched successfully.",
  (req) =>
    timesheetService.getTimesheet(
      req.params.caseId,
      req.params.timesheetId,
      req.user,
    ),
);
const updateTimesheet = respond(
  200,
  "Timesheet entry updated successfully.",
  (req) =>
    timesheetService.updateTimesheet(
      req.params.caseId,
      req.params.timesheetId,
      req.body,
      req.user,
    ),
);
const deleteTimesheet = respond(
  200,
  "Timesheet entry deleted successfully.",
  (req) =>
    timesheetService.deleteTimesheet(
      req.params.caseId,
      req.params.timesheetId,
      req.user,
    ),
);
const submitTimesheet = respond(
  200,
  "Timesheet entry submitted successfully.",
  (req) =>
    timesheetService.submitTimesheet(
      req.params.caseId,
      req.params.timesheetId,
      req.user,
    ),
);
const reviewTimesheet = respond(
  200,
  "Timesheet entry reviewed successfully.",
  (req) =>
    timesheetService.reviewTimesheet(
      req.params.caseId,
      req.params.timesheetId,
      req.body,
      req.user,
    ),
);

module.exports = {
  createTimesheet,
  getTimesheets,
  getTimesheet,
  updateTimesheet,
  deleteTimesheet,
  submitTimesheet,
  reviewTimesheet,
};
