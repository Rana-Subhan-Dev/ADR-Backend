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
const addExpense = respond(201, "Expense added successfully.", (req) =>
  timesheetService.addExpense(
    req.params.caseId,
    req.params.timesheetId,
    req.body,
    req.user,
  ),
);
const updateExpense = respond(200, "Expense updated successfully.", (req) =>
  timesheetService.updateExpense(
    req.params.caseId,
    req.params.timesheetId,
    req.params.expenseId,
    req.body,
    req.user,
  ),
);
const deleteExpense = respond(200, "Expense deleted successfully.", (req) =>
  timesheetService.deleteExpense(
    req.params.caseId,
    req.params.timesheetId,
    req.params.expenseId,
    req.user,
  ),
);
const attachExpenseReceipt = respond(
  201,
  "Expense receipt attached successfully.",
  (req) =>
    timesheetService.attachExpenseReceipt(
      req.params.caseId,
      req.params.timesheetId,
      req.params.expenseId,
      req.body.documentId,
      req.user,
    ),
);
const removeExpenseReceipt = respond(
  200,
  "Expense receipt removed successfully.",
  (req) =>
    timesheetService.removeExpenseReceipt(
      req.params.caseId,
      req.params.timesheetId,
      req.params.expenseId,
      req.params.documentId,
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
  addExpense,
  updateExpense,
  deleteExpense,
  attachExpenseReceipt,
  removeExpenseReceipt,
};
