const crypto = require("crypto");
const ApiError = require("../utils/apiError");

const getConfig = () => {
  const apiKey = process.env.DROPBOX_SIGN_API_KEY;
  const clientId = process.env.DROPBOX_SIGN_CLIENT_ID;
  const basePath =
    process.env.DROPBOX_SIGN_BASE_PATH || "https://api.hellosign.com/v3";
  const testMode =
    String(process.env.DROPBOX_SIGN_TEST_MODE || "true").toLowerCase() !==
    "false";

  if (!apiKey || !clientId) {
    throw new ApiError(
      503,
      "Dropbox Sign is not configured. Set DROPBOX_SIGN_API_KEY and DROPBOX_SIGN_CLIENT_ID.",
    );
  }

  return { apiKey, clientId, basePath, testMode };
};

const authHeader = (apiKey) =>
  `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;

const extractErrorMessage = async (response) => {
  try {
    const payload = await response.json();
    return (
      payload?.error?.error_msg ||
      payload?.error?.error_name ||
      payload?.error ||
      `Dropbox Sign API error (${response.status})`
    );
  } catch {
    return `Dropbox Sign API error (${response.status})`;
  }
};

const dsFetch = async (path, { method = "GET", body, headers = {} } = {}) => {
  const { apiKey, basePath } = getConfig();
  const url = path.startsWith("http") ? path : `${basePath}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(apiKey),
      Accept: "application/json",
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...headers,
    },
    body:
      body == null
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        payload?.error?.error_msg ||
        payload?.error?.error_name ||
        payload?.error ||
        `Dropbox Sign API error (${response.status})`;
      throw new ApiError(502, message);
    }
    return payload;
  }

  if (!response.ok) {
    throw new ApiError(
      502,
      (await extractErrorMessage(response)) ||
        `Dropbox Sign API error (${response.status})`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
};

const normalizeSignatureRequest = (payload) => {
  const request = payload?.signature_request || payload;
  const signatures = (request?.signatures || []).map((signature) => ({
    signature_id: signature.signature_id,
    signer_email: signature.signer_email_address,
    signer_name: signature.signer_name,
    status_code: signature.status_code,
    order: signature.order,
  }));

  return {
    envelopeId: request?.signature_request_id || null,
    signatures,
    raw: request,
  };
};

const listTemplates = async () => {
  const data = await dsFetch("/template/list?page_size=100");
  return (data?.templates || []).map((tpl) => ({
    templateId: tpl.template_id,
    name: tpl.title || tpl.message || tpl.template_id,
    description: tpl.message || null,
    created: tpl.created_at || null,
    lastModified: tpl.updated_at || null,
  }));
};

const buildFormFields = (recipients) =>
  recipients.map((recipient, index) => ({
    api_id: `signature_${index + 1}`,
    type: "signature",
    document_index: 0,
    page: 1,
    x: 72 + index * 120,
    y: 648,
    width: 120,
    height: 30,
    required: true,
    signer: String(index),
    name: recipient.name || `Signer ${index + 1}`,
  }));

const createAndSendEnvelopeFromDocument = async ({
  emailSubject,
  documentBase64,
  documentFileUrl,
  documentName,
  recipients,
  templateId,
  templateRoles,
}) => {
  const { clientId, testMode } = getConfig();
  const resolvedTemplateId =
    typeof templateId === "string" && templateId.trim()
      ? templateId.trim()
      : null;

  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new ApiError(400, "At least one recipient is required.");
  }

  if (resolvedTemplateId && templateRoles?.length) {
    const payload = await dsFetch(
      "/signature_request/create_embedded_with_template",
      {
        method: "POST",
        body: {
          client_id: clientId,
          template_ids: [resolvedTemplateId],
          subject: emailSubject || "Please sign this document",
          title: emailSubject || "Please sign this document",
          test_mode: testMode,
          allow_decline: true,
          signers: templateRoles.map((role, index) => ({
            role: role.roleName || role.role || `Signer ${index + 1}`,
            name: role.name,
            email_address: role.email,
          })),
        },
      },
    );
    return normalizeSignatureRequest(payload);
  }

  const signers = recipients.map((recipient, index) => ({
    email_address: recipient.email,
    name: recipient.name,
    order:
      recipient.routingOrder != null ? recipient.routingOrder - 1 : index,
  }));

  // Prefer JSON + file_urls so signers are never lost to multipart parsing quirks.
  if (documentFileUrl) {
    const payload = await dsFetch("/signature_request/create_embedded", {
      method: "POST",
      body: {
        client_id: clientId,
        test_mode: testMode,
        allow_decline: true,
        subject: emailSubject || "Please sign this document",
        title: emailSubject || documentName || "Please sign this document",
        file_urls: [documentFileUrl],
        signers,
        form_fields_per_document: buildFormFields(recipients),
      },
    });
    return normalizeSignatureRequest(payload);
  }

  if (!documentBase64) {
    throw new ApiError(400, "Document file URL or base64 content is required.");
  }

  const pdfBuffer = Buffer.from(documentBase64, "base64");
  const form = new FormData();
  form.append("client_id", clientId);
  form.append("test_mode", testMode ? "1" : "0");
  form.append("allow_decline", "1");
  form.append("subject", emailSubject || "Please sign this document");
  form.append("title", emailSubject || "Please sign this document");
  form.append("signers", JSON.stringify(signers));
  form.append(
    "form_fields_per_document",
    JSON.stringify(buildFormFields(recipients)),
  );
  form.append(
    "files[]",
    new Blob([pdfBuffer], { type: "application/pdf" }),
    documentName || "Agreement.pdf",
  );

  const payload = await dsFetch("/signature_request/create_embedded", {
    method: "POST",
    body: form,
  });
  return normalizeSignatureRequest(payload);
};

const sendEnvelopeReminder = async (signatureRequestId, { email, name } = {}) => {
  if (!email) {
    throw new ApiError(
      400,
      "Dropbox Sign reminders require a recipient email address.",
    );
  }

  try {
    return await dsFetch(`/signature_request/remind/${signatureRequestId}`, {
      method: "POST",
      body: {
        email_address: email,
        ...(name ? { name } : {}),
      },
    });
  } catch (error) {
    const message = String(error?.message || "");
    // Embedded signature requests cannot be reminded via Dropbox Sign email API.
    if (/embedded/i.test(message)) {
      return { skipped: true, reason: "embedded_not_supported" };
    }
    throw error;
  }
};

const getEnvelope = async (signatureRequestId) =>
  dsFetch(`/signature_request/${signatureRequestId}`);

const listEnvelopeRecipients = async (signatureRequestId) => {
  const data = await getEnvelope(signatureRequestId);
  return normalizeSignatureRequest(data).signatures;
};

const downloadCombinedPdf = async (signatureRequestId) => {
  const { apiKey, basePath } = getConfig();
  const response = await fetch(
    `${basePath}/signature_request/files/${signatureRequestId}?file_type=pdf`,
    {
      method: "GET",
      headers: {
        Authorization: authHeader(apiKey),
        Accept: "application/pdf",
      },
    },
  );

  if (!response.ok) {
    throw new ApiError(
      502,
      (await extractErrorMessage(response)) ||
        `Dropbox Sign API error (${response.status})`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
};

const createRecipientView = async (
  _signatureRequestId,
  { signatureId },
) => {
  if (!signatureId) {
    throw new ApiError(
      400,
      "Dropbox Sign signing URL requires a signature_id for the recipient.",
    );
  }

  const { clientId } = getConfig();
  const data = await dsFetch(`/embedded/sign_url/${signatureId}`);
  const signUrl = data?.embedded?.sign_url || data?.sign_url || null;
  if (!signUrl) {
    throw new ApiError(502, "Dropbox Sign did not return a signing URL.");
  }

  return { url: signUrl, clientId };
};

/**
 * Verify Dropbox Sign event_hash (HMAC-SHA256 of event_time + event_type with API key).
 * When API key is missing, verification is skipped (same spirit as empty DocuSign HMAC secret).
 */
const verifyWebhookHmac = (payload) => {
  const apiKey = process.env.DROPBOX_SIGN_API_KEY;
  if (!apiKey) return true;

  const event = payload?.event;
  if (!event?.event_time || !event?.event_type || !event?.event_hash) {
    return false;
  }

  const digest = crypto
    .createHmac("sha256", apiKey)
    .update(`${event.event_time}${event.event_type}`)
    .digest("hex");

  const provided = String(event.event_hash).trim().toLowerCase();
  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(provided),
    );
  } catch {
    return false;
  }
};

module.exports = {
  getConfig,
  listTemplates,
  createAndSendEnvelopeFromDocument,
  sendEnvelopeReminder,
  getEnvelope,
  listEnvelopeRecipients,
  downloadCombinedPdf,
  createRecipientView,
  verifyWebhookHmac,
};
