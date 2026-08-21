const docusignService = require("../services/docusign.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const respond = (status, message, handler) =>
  asyncHandler(async (req, res) =>
    res
      .status(status)
      .json(new ApiResponse(status, await handler(req), message)),
  );
const createEnvelope = respond(
  201,
  "DocuSign envelope created successfully.",
  (req) =>
    docusignService.createEnvelope(req.params.caseId, req.body, req.user),
);
const getEnvelopes = respond(
  200,
  "DocuSign envelopes fetched successfully.",
  (req) => docusignService.getEnvelopes(req.params.caseId, req.query, req.user),
);
const getEnvelope = respond(
  200,
  "DocuSign envelope fetched successfully.",
  (req) =>
    docusignService.getEnvelope(
      req.params.caseId,
      req.params.envelopeRecordId,
      req.user,
    ),
);
const updateEnvelope = respond(
  200,
  "DocuSign envelope updated successfully.",
  (req) =>
    docusignService.updateEnvelope(
      req.params.caseId,
      req.params.envelopeRecordId,
      req.body,
      req.user,
    ),
);
const queueSend = respond(202, "DocuSign send queued successfully.", (req) =>
  docusignService.queueIntegration(
    req.params.caseId,
    req.params.envelopeRecordId,
    req.user,
    false,
  ),
);
const queueReminder = respond(
  202,
  "DocuSign reminder queued successfully.",
  (req) =>
    docusignService.queueIntegration(
      req.params.caseId,
      req.params.envelopeRecordId,
      req.user,
      true,
    ),
);
module.exports = {
  createEnvelope,
  getEnvelopes,
  getEnvelope,
  updateEnvelope,
  queueSend,
  queueReminder,
};
