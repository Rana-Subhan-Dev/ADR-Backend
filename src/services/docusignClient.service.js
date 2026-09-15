const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const ApiError = require("../utils/apiError");

let cachedToken = null;
let cachedTokenExpiresAt = 0;

const getConfig = () => {
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
  const userId = process.env.DOCUSIGN_USER_ID;
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
  const authServer =
    process.env.DOCUSIGN_AUTH_SERVER || "account-d.docusign.com";
  const basePath =
    process.env.DOCUSIGN_BASE_PATH || "https://demo.docusign.net/restapi";
  let privateKey = process.env.DOCUSIGN_RSA_PRIVATE_KEY || "";
  privateKey = privateKey.replace(/\\n/g, "\n");

  if (!integrationKey || !userId || !accountId || !privateKey) {
    throw new ApiError(
      503,
      "DocuSign is not configured. Set DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID, and DOCUSIGN_RSA_PRIVATE_KEY.",
    );
  }

  return { integrationKey, userId, accountId, authServer, basePath, privateKey };
};

const requestAccessToken = async () => {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const { integrationKey, userId, authServer, privateKey } = getConfig();
  const assertion = jwt.sign(
    {
      iss: integrationKey,
      sub: userId,
      aud: authServer,
      scope: "signature impersonation",
    },
    privateKey,
    {
      algorithm: "RS256",
      expiresIn: 3600,
      header: { typ: "JWT", alg: "RS256" },
    },
  );

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(`https://${authServer}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      502,
      payload.error_description ||
        payload.error ||
        "Failed to authenticate with DocuSign.",
    );
  }

  cachedToken = payload.access_token;
  cachedTokenExpiresAt = now + Number(payload.expires_in || 3600) * 1000;
  return cachedToken;
};

const dsFetch = async (path, { method = "GET", body, headers = {} } = {}) => {
  const { basePath, accountId } = getConfig();
  const token = await requestAccessToken();
  const url = path.startsWith("http")
    ? path
    : `${basePath}/v2.1/accounts/${accountId}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body && !(body instanceof Buffer)
        ? { "Content-Type": "application/json" }
        : {}),
      ...headers,
    },
    body:
      body == null
        ? undefined
        : Buffer.isBuffer(body)
          ? body
          : JSON.stringify(body),
  });

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        payload.message ||
        payload.errorCode ||
        `DocuSign API error (${response.status})`;
      throw new ApiError(502, message);
    }
    return payload;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new ApiError(502, `DocuSign API error (${response.status})`);
  }
  return buffer;
};

const listTemplates = async () => {
  const data = await dsFetch("/templates?count=100");
  return (data?.envelopeTemplates || []).map((tpl) => ({
    templateId: tpl.templateId,
    name: tpl.name,
    description: tpl.description || null,
    created: tpl.created || null,
    lastModified: tpl.lastModified || null,
  }));
};

const createAndSendEnvelopeFromDocument = async ({
  emailSubject,
  documentBase64,
  documentName,
  recipients,
  templateId,
  templateRoles,
}) => {
  if (templateId && templateRoles?.length) {
    return dsFetch("/envelopes", {
      method: "POST",
      body: {
        emailSubject: emailSubject || "Please sign this document",
        status: "sent",
        templateId,
        templateRoles: templateRoles.map((role, index) => ({
          roleName: role.roleName || role.role || `Signer ${index + 1}`,
          name: role.name,
          email: role.email,
          routingOrder: String(role.routingOrder || index + 1),
          clientUserId: role.email,
        })),
      },
    });
  }

  const signers = recipients.map((recipient, index) => ({
    email: recipient.email,
    name: recipient.name,
    recipientId: String(index + 1),
    routingOrder: String(recipient.routingOrder || index + 1),
    clientUserId: recipient.email,
    tabs: {
      signHereTabs: [
        {
          documentId: "1",
          pageNumber: "1",
          xPosition: String(72 + index * 36),
          yPosition: "648",
        },
      ],
    },
  }));

  return dsFetch("/envelopes", {
    method: "POST",
    body: {
      emailSubject: emailSubject || "Please sign this document",
      status: "sent",
      documents: [
        {
          documentBase64,
          name: documentName || "Agreement.pdf",
          fileExtension: "pdf",
          documentId: "1",
        },
      ],
      recipients: { signers },
    },
  });
};

const sendEnvelopeReminder = async (docusignEnvelopeId) =>
  dsFetch(`/envelopes/${docusignEnvelopeId}?resend_envelope=true`, {
    method: "PUT",
    body: {},
  });

const getEnvelope = async (docusignEnvelopeId) =>
  dsFetch(`/envelopes/${docusignEnvelopeId}`);

const listEnvelopeRecipients = async (docusignEnvelopeId) =>
  dsFetch(`/envelopes/${docusignEnvelopeId}/recipients`);

const downloadCombinedPdf = async (docusignEnvelopeId) =>
  dsFetch(
    `/envelopes/${docusignEnvelopeId}/documents/combined?certificate=true`,
    {
      headers: { Accept: "application/pdf" },
    },
  );

const createRecipientView = async (
  docusignEnvelopeId,
  { email, userName, clientUserId, returnUrl },
) =>
  dsFetch(`/envelopes/${docusignEnvelopeId}/views/recipient`, {
    method: "POST",
    body: {
      authenticationMethod: "none",
      email,
      userName,
      clientUserId: clientUserId || email,
      returnUrl:
        returnUrl || process.env.CLIENT_URL || "http://localhost:3000",
    },
  });

const verifyWebhookHmac = (rawBody, signatureHeader) => {
  const secret = process.env.DOCUSIGN_WEBHOOK_HMAC_SECRET;
  if (!secret) return true;
  if (!signatureHeader) return false;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  const provided = String(signatureHeader).trim();
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
