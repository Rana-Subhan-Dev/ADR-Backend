const jwt = require("jsonwebtoken");

const generateAccessToken = (payload) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    {
      expiresIn:
        process.env.ACCESS_TOKEN_EXPIRES_IN ||
        process.env.JWT_EXPIRES_IN ||
        "15m",
    }
  );
};

const verifyAccessToken = (token) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return jwt.verify(
    token,
    process.env.JWT_SECRET
  );
};

module.exports = {
  generateAccessToken,
  verifyAccessToken,
};