const prisma = require("../config/prisma");

const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");
const { verifyAccessToken } = require("../utils/jwt");

const auth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  const token =
    req.cookies?.accessToken ||
    (authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null);

  if (!token) {
    throw new ApiError(401, "Access token is required.");
  }

  let decoded;

  try {
    decoded = verifyAccessToken(token);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new ApiError(401, "Access token has expired.");
    }

    if (error.name === "JsonWebTokenError") {
      throw new ApiError(401, "Invalid access token.");
    }

    throw new ApiError(401, "Authentication failed.");
  }

  if (!decoded?.id) {
    throw new ApiError(401, "Invalid access token.");
  }

  const user = await prisma.user.findUnique({
    where: {
      id: decoded.id,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      roleId: true,
      role: {
        select: {
          id: true,
          name: true,
        },
      },
      createdAt: true,
    },
  });

  if (!user) {
    throw new ApiError(401, "User associated with this token no longer exists.");
  }

  if (user.status !== "ACTIVE") {
    throw new ApiError(403, "Your account is not active.");
  }

  req.user = user;

  next();
});

module.exports = auth;
