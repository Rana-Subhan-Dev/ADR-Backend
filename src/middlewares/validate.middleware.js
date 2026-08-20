const ApiError = require("../utils/apiError");

const validate = (schema, source = "body") => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => detail.message);

      return next(new ApiError(400, "Validation failed", errors));
    }

    req[source] = value;

    next();
  };
};

module.exports = validate;
