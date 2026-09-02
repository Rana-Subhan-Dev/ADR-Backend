const { RoleName, UserType } = require("@prisma/client");

const INVITABLE_ROLES = Object.values(RoleName).filter(
  (role) => role !== RoleName.SUPER_ADMIN,
);

const RESET_TOKEN_BYTES = 32;
const INVITATION_TOKEN_BYTES = 32;
const INVITATION_EXPIRES_IN_DAYS = 7;

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCK_MINUTES = 30;

module.exports = {
  RoleName,
  UserType,
  INVITABLE_ROLES,
  RESET_TOKEN_BYTES,
  INVITATION_TOKEN_BYTES,
  INVITATION_EXPIRES_IN_DAYS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  ACCOUNT_LOCK_MINUTES,
};
