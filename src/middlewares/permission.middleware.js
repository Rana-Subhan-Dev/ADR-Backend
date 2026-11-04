const ApiError = require("../utils/apiError");
const { RoleName } = require("../constants/auth.constants");

const hasPermission = (user, module, action) => {
  if (user?.role?.name === RoleName.SUPER_ADMIN) return true;
  return Boolean(
    user?.role?.rolePermissions?.some(
      ({ permission }) =>
        permission.module === module && permission.action === action,
    ),
  );
};

const requirePermission = (module, action) => (req, res, next) => {
  if (hasPermission(req.user, module, action)) return next();
  return next(
    new ApiError(403, "You do not have permission to perform this action."),
  );
};

/** Pass if the user has any of the listed module/action pairs. */
const requireAnyPermission =
  (...pairs) =>
  (req, res, next) => {
    if (req.user?.role?.name === RoleName.SUPER_ADMIN) return next();
    const granted = pairs.some(([module, action]) =>
      hasPermission(req.user, module, action),
    );
    if (!granted) {
      return next(
        new ApiError(403, "You do not have permission to perform this action."),
      );
    }
    return next();
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
  hasPermission,
  requirePermission,
  requireAnyPermission,
  requireInternalRole,
  requireSelfOrPermission,
};
