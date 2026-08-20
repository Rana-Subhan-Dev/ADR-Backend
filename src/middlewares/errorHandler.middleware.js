const ApiError = require("../utils/apiError");

const errorHandler = (err, req, res, next) => {
  if (!(err instanceof ApiError)) {
    err = new ApiError(
      err.statusCode || 500,
      err.message || "Internal Server Error",
    );
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
