const rateLimit = require("express-rate-limit");

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS);
const maxRequests = Number(process.env.RATE_LIMIT_MAX_REQUESTS);

if (!windowMs || !maxRequests) {
  throw new Error(
    "Rate limit configuration is missing or invalid in environment variables.",
  );
}

const rateLimiter = rateLimit({
  windowMs,
  limit: maxRequests,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    success: false,
    statusCode: 429,
    message: "Too many requests. Please try again later.",
  },
});

module.exports = rateLimiter;
