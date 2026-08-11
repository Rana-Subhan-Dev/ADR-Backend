const userRepository = require("../repositories/user.repository");
const ApiError = require("../utils/apiError");

const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  USER_SORT_FIELDS,
  ADMIN_SETTABLE_STATUSES,
} = require("../constants/user.constants");

const getUsers = async (query) => {
  const page = Number(query.page) || DEFAULT_PAGE;

  const limit = Math.min(
    Number(query.limit) || DEFAULT_LIMIT,
    MAX_LIMIT
  );

  const {
    search,
    role,
    status,
    sortBy = USER_SORT_FIELDS.CREATED_AT,
    sortOrder = "desc",
  } = query;

  const where = {};

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  if (role) {
    where.role = { name: role };
  }

  if (status) {
    where.status = status;
  }

  const skip = (page - 1) * limit;

  const orderBy = { [sortBy]: sortOrder };

  const { users, total } = await userRepository.getUsers({
    skip,
    take: limit,
    where,
    orderBy,
  });

  const totalPages = Math.ceil(total / limit);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

const getUserById = async (id) => {
  const user = await userRepository.findUserById(id);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  return user;
};

const updateUser = async (id, data) => {
  const existingUser = await userRepository.findUserById(id);

  if (!existingUser) {
    throw new ApiError(404, "User not found.");
  }

  return userRepository.updateUser(id, data);
};

const updateUserStatus = async ({ userId, status, reason, actingUserId }) => {
  const existingUser = await userRepository.findUserById(userId);

  if (!existingUser) {
    throw new ApiError(404, "User not found.");
  }

  if (!ADMIN_SETTABLE_STATUSES.includes(status)) {
    throw new ApiError(400, "Invalid status.");
  }

  const data = { status };

  if (status === "DEACTIVATED") {
    data.deactivatedAt = new Date();
    data.deactivatedById = actingUserId;
    data.deactivationReason = reason || null;
  }

  if (status === "ACTIVE") {
    data.deactivatedAt = null;
    data.deactivatedById = null;
    data.deactivationReason = null;
    data.failedLoginAttempts = 0;
    data.lockedUntil = null;
  }

  return userRepository.updateUser(userId, data);
};

module.exports = {
  getUsers,
  getUserById,
  updateUser,
  updateUserStatus,
};
