const { UserStatus } = require("@prisma/client");

const USER_SORT_FIELDS = {
  CREATED_AT: "createdAt",
  UPDATED_AT: "updatedAt",
  FIRST_NAME: "firstName",
  LAST_NAME: "lastName",
  EMAIL: "email",
};

const ADMIN_SETTABLE_STATUSES = [
  UserStatus.ACTIVE,
  UserStatus.DEACTIVATED,
  UserStatus.LOCKED,
];

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

module.exports = {
  UserStatus,
  USER_SORT_FIELDS,
  ADMIN_SETTABLE_STATUSES,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
