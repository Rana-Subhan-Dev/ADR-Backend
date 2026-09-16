const ApiError = require("../utils/apiError");

let cachedToken = null;
let cachedTokenExpiresAt = 0;

const getConfig = () => {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const hostUserId = process.env.ZOOM_HOST_USER_ID || "me";
  if (!accountId || !clientId || !clientSecret) {
    throw new ApiError(
      503,
      "Zoom is not configured. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET.",
    );
  }
  return { accountId, clientId, clientSecret, hostUserId };
};

const getAccessToken = async () => {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt - 60_000) return cachedToken;

  const { accountId, clientId, clientSecret } = getConfig();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const url = new URL("https://zoom.us/oauth/token");
  url.searchParams.set("grant_type", "account_credentials");
  url.searchParams.set("account_id", accountId);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      502,
      payload.reason || payload.error || "Failed to authenticate with Zoom.",
    );
  }
  cachedToken = payload.access_token;
  cachedTokenExpiresAt = now + Number(payload.expires_in || 3600) * 1000;
  return cachedToken;
};

const zoomFetch = async (path, { method = "GET", body } = {}) => {
  const token = await getAccessToken();
  const response = await fetch(`https://api.zoom.us/v2${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      502,
      payload.message || payload.reason || `Zoom API error (${response.status})`,
    );
  }
  return payload;
};

const createMeeting = async ({
  topic,
  startTime,
  durationMinutes,
  timezone,
  alternateHostEmails = [],
}) => {
  const { hostUserId } = getConfig();
  const settings = {
    waiting_room: process.env.ZOOM_WAITING_ROOM !== "false",
    join_before_host: process.env.ZOOM_JOIN_BEFORE_HOST === "true",
    mute_upon_entry: true,
    meeting_authentication: false,
  };
  if (alternateHostEmails.length) {
    settings.alternative_hosts = alternateHostEmails.join(",");
  }

  return zoomFetch(`/users/${encodeURIComponent(hostUserId)}/meetings`, {
    method: "POST",
    body: {
      topic: topic || "FedArb Hearing",
      type: 2,
      start_time: new Date(startTime).toISOString().replace(/\.\d{3}Z$/, "Z"),
      duration: Math.max(15, Number(durationMinutes) || 60),
      timezone: timezone || "America/New_York",
      settings,
    },
  });
};

const updateMeeting = async (
  meetingId,
  { topic, startTime, durationMinutes, timezone, alternateHostEmails = [] },
) => {
  const settings = {};
  if (alternateHostEmails.length) {
    settings.alternative_hosts = alternateHostEmails.join(",");
  }
  return zoomFetch(`/meetings/${meetingId}`, {
    method: "PATCH",
    body: {
      ...(topic && { topic }),
      ...(startTime && {
        start_time: new Date(startTime).toISOString().replace(/\.\d{3}Z$/, "Z"),
      }),
      ...(durationMinutes && { duration: Math.max(15, Number(durationMinutes)) }),
      ...(timezone && { timezone }),
      ...(Object.keys(settings).length ? { settings } : {}),
    },
  });
};

const deleteMeeting = async (meetingId) => {
  if (!meetingId) return null;
  try {
    return await zoomFetch(`/meetings/${meetingId}`, { method: "DELETE" });
  } catch (error) {
    if (error.statusCode === 502 && /not found|404/i.test(error.message || ""))
      return null;
    throw error;
  }
};

module.exports = {
  getConfig,
  createMeeting,
  updateMeeting,
  deleteMeeting,
};
