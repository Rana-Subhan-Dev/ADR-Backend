const multer = require("multer");
const docusignService = require("../services/docusign.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const webhookUpload = multer();

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

const getEnvelopeByExternalId = respond(
  200,
  "DocuSign envelope fetched successfully.",
  (req) =>
    docusignService.getEnvelopeByExternalId(
      req.params.caseId,
      req.params.envelopeId,
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

const retryEnvelope = respond(
  201,
  "DocuSign envelope retry created successfully.",
  (req) =>
    docusignService.retryEnvelope(
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

const parseDropboxSignPayload = (req) => {
  if (typeof req.body?.json === "string") {
    try {
      return JSON.parse(req.body.json || "{}");
    } catch {
      return {};
    }
  }
  if (req.body && typeof req.body === "object" && req.body.event) {
    return req.body;
  }
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString("utf8") || "{}");
    } catch {
      return {};
    }
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }
  return {};
};

const handleWebhook = [
  (req, res, next) => {
    const contentType = req.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return require("express").json({ limit: "5mb" })(req, res, next);
    }
    return webhookUpload.none()(req, res, next);
  },
  asyncHandler(async (req, res) => {
    const payload = parseDropboxSignPayload(req);
    await docusignService.handleWebhook(payload);
    // Dropbox Sign requires this exact plain-text acknowledgment.
    res.status(200).type("text/plain").send("Hello API Event Received");
  }),
];

module.exports = {
  listTemplates,
  sendEnvelope,
  getEnvelopes,
  getEnvelope,
  getEnvelopeByExternalId,
  remindEnvelope,
  retryEnvelope,
  getSignedPdf,
  getSourcePdf,
  getSigningUrl,
  handleWebhook,
};
