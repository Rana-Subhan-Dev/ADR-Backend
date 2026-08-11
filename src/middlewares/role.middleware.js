const ApiError = require("../utils/apiError");

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user?.role?.name;

    if (!userRole || !allowedRoles.includes(userRole)) {
      return next(
        new ApiError(403, "You do not have permission to perform this action.")
      );
    }

    next();
  };
};

module.exports = requireRole;
