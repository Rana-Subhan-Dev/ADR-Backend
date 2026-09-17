const ApiError = require("../utils/apiError");
const {
  isPrismaConnectivityError,
  isPrismaTransactionTimeoutError,
} = require("../config/prisma");

const sanitizePrismaMessage = (message) => {
  if (!message) return "Database error.";
  const text = String(message);
  if (/Can't reach database server/i.test(text)) {
    return "Database is temporarily unreachable. Please retry shortly.";
  }
  if (/Transaction already closed|Transaction not found|timeout for this transaction/i.test(text)) {
    return "The database operation timed out. Please retry.";
  }
  if (process.env.NODE_ENV === "production" && /Invalid `/.test(text)) {
    return "A database error occurred.";
  }
  return text;
};

const errorHandler = (err, req, res, next) => {
  if (err.name === "MulterError") {
    err = new ApiError(
      err.code === "LIMIT_FILE_SIZE" ? 413 : 400,
      err.code === "LIMIT_FILE_SIZE"
        ? "File size must not exceed 10MB."
        : err.message,
    );
  }

  if (!(err instanceof ApiError)) {
    if (isPrismaConnectivityError(err)) {
      err = new ApiError(
        503,
        sanitizePrismaMessage(err.message),
      );
    } else if (isPrismaTransactionTimeoutError(err)) {
      err = new ApiError(
        503,
        sanitizePrismaMessage(err.message),
      );
    } else {
      err = new ApiError(
        err.statusCode || 500,
        sanitizePrismaMessage(err.message) || "Internal Server Error",
      );
    }
  }

  return res.status(err.statusCode).json({
    success: err.success,
    statusCode: err.statusCode,
    message: err.message,
    errors: err.errors || [],
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};

module.exports = errorHandler;
