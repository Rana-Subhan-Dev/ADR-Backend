const crypto = require("crypto");

const {
  RESET_TOKEN_BYTES,
  INVITATION_TOKEN_BYTES,
  INVITATION_EXPIRES_IN_DAYS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  ACCOUNT_LOCK_MINUTES,
} = require("../constants/auth.constants");

const authRepository = require("../repositories/auth.repository");

const { hashPassword, comparePassword } = require("../utils/password");

const { generateAccessToken } = require("../utils/jwt");

const ApiError = require("../utils/apiError");

const { buildJwtPayload, sanitizeUser } = require("../utils/auth");

const { sendEmail } = require("../utils/sendEmail");
const {
  invitationTemplate,
} = require("../shared/emailTemplates/invitationEmail");

const hashToken = (rawToken) =>
  crypto.createHash("sha256").update(rawToken).digest("hex");

const inviteUser = async (payload, invitedByUserId) => {
  const { email, jobTitle, userType, roleName } = payload;

  const normalizedEmail = email.toLowerCase().trim();

  const internalRoles = new Set([
    "SUPER_ADMIN",
    "ADMIN_LEADERSHIP",
    "CASE_MANAGER",
    "ACCOUNTING_STAFF",
  ]);
  const expectedUserType = internalRoles.has(roleName)
    ? "INTERNAL"
    : "EXTERNAL";

  if (userType !== expectedUserType) {
    throw new ApiError(
      400,
      "The selected role is not valid for the specified user type.",
    );
  }

  const existingUser = await authRepository.findUserByEmail(normalizedEmail);

  if (existingUser) {
    throw new ApiError(409, "A user already exists with this email.");
  }

  const role = await authRepository.findRoleByName(roleName);

  if (!role) {
    throw new ApiError(400, "Invalid role.");
  }

  const rawToken = crypto.randomBytes(INVITATION_TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + INVITATION_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
  );

  const user = await authRepository.createInvitedUser({
    data: {
      firstName: "",
      lastName: "",
      email: normalizedEmail,
      jobTitle: jobTitle || null,
      userType,
      roleId: role.id,
      status: "INVITED",
      invitedById: invitedByUserId,
    },
    invitation: {
      tokenHash,
      invitedById: invitedByUserId,
      expiresAt,
      lastSentAt: now,
    },
  });

  const setupUrl = `${process.env.CLIENT_URL.replace(/\/$/, "")}/accept-invitation?token=${rawToken}`;

  await sendEmail(
    "Invitation to join FEDARB",
    invitationTemplate(roleName, setupUrl, INVITATION_EXPIRES_IN_DAYS),
    normalizedEmail,
    "HTML",
  );

  return {
    user: sanitizeUser(user),
    ...(process.env.NODE_ENV === "development" && {
      invitationToken: rawToken,
    }),
  };
};

const acceptInvitation = async ({
  token,
  firstName,
  lastName,
  phone,
  password,
}) => {
  const tokenHash = hashToken(token);

  const invitation = await authRepository.findInvitationByTokenHash(tokenHash);

  if (!invitation) {
    throw new ApiError(400, "Invalid or expired invitation.");
  }

  if (invitation.status !== "PENDING") {
    throw new ApiError(
      400,
      "This invitation has already been used or revoked.",
    );
  }

  if (invitation.expiresAt <= new Date()) {
    throw new ApiError(
      400,
      "This invitation has expired. Please request a new one.",
    );
  }

  const passwordHash = await hashPassword(password);

  const user = await authRepository.acceptInvitation({
    invitationId: invitation.id,
    userId: invitation.userId,
    firstName,
    lastName,
    phone,
    passwordHash,
  });

  const accessToken = generateAccessToken(buildJwtPayload(user));

  return {
    user: sanitizeUser(user),
    accessToken,
  };
};

const signIn = async (payload, requestMeta = {}) => {
  const { email, password } = payload;
  const { ipAddress, userAgent } = requestMeta;

  const normalizedEmail = email.toLowerCase().trim();

  const user = await authRepository.findUserByEmail(normalizedEmail);

  if (!user) {
    throw new ApiError(401, "Invalid email or password.");
  }

  if (user.status === "DEACTIVATED") {
    throw new ApiError(403, "This account has been deactivated.");
  }

  if (user.status === "INVITED" || user.status === "INVITE_EXPIRED") {
    throw new ApiError(403, "Please accept your invitation before signing in.");
  }

  if (
    user.status === "LOCKED" &&
    user.lockedUntil &&
    user.lockedUntil > new Date()
  ) {
    throw new ApiError(
      403,
      `Account is locked. Please try again after ${user.lockedUntil.toISOString()}.`,
    );
  }

  const isPasswordValid = await comparePassword(password, user.passwordHash);

  await authRepository.recordLoginAttempt({
    userId: user.id,
    emailAttempted: normalizedEmail,
    isSuccessful: isPasswordValid,
    failureReason: isPasswordValid ? null : "INVALID_PASSWORD",
    ipAddress,
    userAgent,
  });

  if (!isPasswordValid) {
    const nextAttempts = user.failedLoginAttempts + 1;
    const shouldLock = nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;

    await authRepository.incrementFailedLoginAttempts(user.id, {
      lockedUntil: shouldLock
        ? new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000)
        : undefined,
    });

    throw new ApiError(401, "Invalid email or password.");
  }

  await authRepository.resetFailedLoginAttempts(user.id);

  const accessToken = generateAccessToken(buildJwtPayload(user));

  return {
    user: sanitizeUser(user),
    accessToken,
  };
};

const forgotPassword = async (email, requestMeta = {}) => {
  const normalizedEmail = email.toLowerCase().trim();

  const genericResponse = {
    message:
      "If an account with this email exists, a password reset link has been generated.",
  };

  const user = await authRepository.findUserByEmail(normalizedEmail);

  if (!user || !["ACTIVE", "LOCKED"].includes(user.status)) {
    return genericResponse;
  }

  await authRepository.invalidateUserResetTokens(user.id);

  const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(rawToken);

  const resetMinutes = Number(process.env.PASSWORD_RESET_EXPIRES_IN) || 15;
  const expiresAt = new Date(Date.now() + resetMinutes * 60 * 1000);

  await authRepository.createPasswordResetToken({
    userId: user.id,
    tokenHash,
    expiresAt,
    requestedIp: requestMeta.ipAddress || null,
  });

  return {
    ...genericResponse,
    ...(process.env.NODE_ENV === "development" && {
      resetToken: rawToken,
    }),
  };
};

const resetPassword = async ({ token, password }) => {
  const tokenHash = hashToken(token);

  const resetTokenRecord =
    await authRepository.findPasswordResetTokenByHash(tokenHash);

  if (!resetTokenRecord || resetTokenRecord.usedAt) {
    throw new ApiError(400, "Invalid or expired reset token.");
  }

  if (resetTokenRecord.expiresAt <= new Date()) {
    await authRepository.markPasswordResetTokenUsed(resetTokenRecord.id);

    throw new ApiError(400, "Reset token has expired.");
  }

  const passwordHash = await hashPassword(password);

  await authRepository.resetPasswordWithToken({
    userId: resetTokenRecord.userId,
    passwordHash,
    tokenId: resetTokenRecord.id,
  });

  return {
    message: "Password reset successfully.",
  };
};

module.exports = {
  inviteUser,
  acceptInvitation,
  signIn,
  forgotPassword,
  resetPassword,
};
