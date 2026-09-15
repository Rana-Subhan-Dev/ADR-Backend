const docusignService = require("../services/docusign.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const respond = (status, message, handler) =>
  asyncHandler(async (req, res) =>
    res
      .status(status)
      .json(new ApiResponse(status, await handler(req), message)),
  );

const listTemplates = respond(
  200,
  "DocuSign templates fetched successfully.",
  (req) => docusignService.listTemplates(req.params.caseId, req.user),
);

const sendEnvelope = respond(
  201,
  "DocuSign envelope sent successfully.",
  (req) => docusignService.sendEnvelope(req.params.caseId, req.body, req.user),
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

const remindEnvelope = respond(
  200,
  "DocuSign reminder sent successfully.",
  (req) =>
    docusignService.remindEnvelope(
      req.params.caseId,
      req.params.envelopeRecordId,
      req.user,
    ),
);

const getSignedPdf = respond(
  200,
  "Signed PDF download URL generated successfully.",
  (req) =>
    docusignService.getSignedPdfDownload(
      req.params.caseId,
      req.params.envelopeRecordId,
      req.user,
    ),
);

const getSourcePdf = respond(
  200,
  "Source document download URL generated successfully.",
  (req) =>
    docusignService.getSourcePdfDownload(
      req.params.caseId,
      req.params.envelopeRecordId,
      req.user,
    ),
);

const getSigningUrl = respond(
  200,
  "DocuSign signing URL generated successfully.",
  (req) =>
    docusignService.getRecipientSigningUrl(
      req.params.caseId,
      req.params.envelopeRecordId,
      req.user,
      req.body?.returnUrl || req.query?.returnUrl,
    ),
);

const handleWebhook = asyncHandler(async (req, res) => {
  const rawBody = Buffer.isBuffer(req.rawBody)
    ? req.rawBody
    : Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(
          typeof req.body === "string"
            ? req.body
            : JSON.stringify(req.body || {}),
        );
  let payload = {};
  try {
    payload = JSON.parse(rawBody.toString("utf8") || "{}");
  } catch {
    payload = {};
  }
  const signature =
    req.get("X-DocuSign-Signature-1") ||
    req.get("x-docusign-signature-1") ||
    req.get("X-Authorization-Digest");
  const result = await docusignService.handleWebhook(
    payload,
    rawBody,
    signature,
  );
  res.status(200).json(new ApiResponse(200, result, "Webhook processed."));
});

module.exports = {
  listTemplates,
  sendEnvelope,
  getEnvelopes,
  getEnvelope,
  remindEnvelope,
  getSignedPdf,
  getSourcePdf,
  getSigningUrl,
  handleWebhook,
};
