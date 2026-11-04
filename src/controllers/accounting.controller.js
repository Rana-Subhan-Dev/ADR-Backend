const accountingCaseFinancialsService = require("../services/accountingCaseFinancials.service");
const accountingTimesheetsService = require("../services/accountingTimesheets.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const respond = (status, message, handler) =>
  asyncHandler(async (req, res) =>
    res
      .status(status)
      .json(new ApiResponse(status, await handler(req), message)),
  );

const listCaseFinancials = respond(
  200,
  "Case financials fetched successfully.",
  (req) => accountingCaseFinancialsService.listCaseFinancials(req.query),
);

const getCaseFinancials = respond(
  200,
  "Case financial overview fetched successfully.",
  (req) =>
    accountingCaseFinancialsService.getCaseFinancials(req.params.caseId),
);

const contactCaseManager = respond(
  200,
  "Message sent to case manager successfully.",
  (req) =>
    accountingCaseFinancialsService.contactCaseManager(
      req.params.caseId,
      req.body,
      req.user,
    ),
);

const listTimesheets = respond(
  200,
  "Timesheets fetched successfully.",
  (req) => accountingTimesheetsService.listTimesheets(req.query),
);

module.exports = {
  listCaseFinancials,
  getCaseFinancials,
  contactCaseManager,
  listTimesheets,
};
