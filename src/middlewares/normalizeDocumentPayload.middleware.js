const ApiError = require("../utils/apiError");

const parseArray = (value, field) => {
  if (value === undefined || value === "") return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new ApiError(400, `${field} must be a JSON array.`);
  }
};

const normalizeDocumentPayload = (req, res, next) => {
  req.body.tags = parseArray(req.body.tags, "tags");
  req.body.recipientParticipantIds = parseArray(
    req.body.recipientParticipantIds,
    "recipientParticipantIds",
  );
  next();
};

module.exports = normalizeDocumentPayload;
