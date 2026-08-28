const ApiError = require("../utils/apiError");
const { RoleName } = require("../constants/auth.constants");

const requirePermission = (module, action) => (req, res, next) => {
  if (req.user?.role?.name === RoleName.SUPER_ADMIN) return next();

  const granted = req.user?.role?.rolePermissions?.some(
    ({ permission }) =>
      permission.module === module && permission.action === action,
  );

  if (!granted) {
    return next(
      new ApiError(403, "You do not have permission to perform this action."),
    );
  }

  next();
};

const requireInternalRole =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role?.name)) {
      return next(
        new ApiError(403, "You do not have permission to perform this action."),
      );
    }

    next();
  };

const requireSelfOrPermission =
  (module, action, param = "id") =>
  (req, res, next) => {
    if (req.user?.id === req.params[param]) return next();

    return requirePermission(module, action)(req, res, next);
  };

module.exports = {
  requirePermission,
  requireInternalRole,
  requireSelfOrPermission,
};
