const crypto = require("crypto");

const {
  RESET_TOKEN_BYTES,
  INVITATION_TOKEN_BYTES,
  INVITATION_EXPIRES_IN_DAYS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  ACCOUNT_LOCK_MINUTES,
} = require("../constants/auth.constants");

const authRepository = require("../repositories/auth.repository");
const prisma = require("../config/prisma");

const { hashPassword, comparePassword } = require("../utils/password");

const { generateAccessToken } = require("../utils/jwt");

const ApiError = require("../utils/apiError");

const { buildJwtPayload, sanitizeUser } = require("../utils/auth");

const { sendEmail } = require("../utils/sendEmail");
const {
  invitationTemplate,
} = require("../shared/emailTemplates/invitationEmail");
const {
  forgotPasswordTemplate,
} = require("../shared/emailTemplates/forgotPasswordEmail");

const hashToken = (rawToken) =>
  crypto.createHash("sha256").update(rawToken).digest("hex");

const normalizeRoleForClient = (roleName) => {
  if (roleName === "CASE_MANAGER") {
    return "case-manager";
  }
  if (roleName === "LAWYER") {
    return "lawyer";
  }
  if (roleName === "CLIENT") {
    return "client";
  }
  if (roleName === "NEUTRAL") {
    return "neutral";
  }
  if (roleName === "ACCOUNTING_STAFF") {
    return "accounting-staff";
  }
  return roleName;
};

const setupUrlForClient = (roleName, token, type = "invitation") => {
  const normalizedRoleName = normalizeRoleForClient(roleName);
  if (type === "invitation") {
    return `${process.env.CLIENT_URL.replace(/\/$/, "")}/auth/${normalizedRoleName}/invitation?token=${token}`;
  }
  if (type === "password-reset-request") {
    return `${process.env.CLIENT_URL.replace(/\/$/, "")}/auth/${normalizedRoleName}/reset-password?token=${token}`;
  }
  throw new ApiError(400, "Invalid type.");
};

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

  const setupUrl = setupUrlForClient(roleName, rawToken);

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

const resendInvite = async (userId, invitedByUserId) => {
  const user = await authRepository.findUserById(userId);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  if (!["INVITED", "INVITE_EXPIRED"].includes(user.status)) {
    throw new ApiError(
      400,
      "Only users with a pending or expired invitation can be resent an invite.",
    );
  }

  const rawToken = crypto.randomBytes(INVITATION_TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + INVITATION_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
  );

  const updatedUser = await prisma.$transaction(async (tx) => {
    const priorResendCount =
      await authRepository.getLatestAccountInvitationResendCount(userId, tx);

    await authRepository.revokePendingAccountInvitations(userId, tx);

    await authRepository.createAccountInvitation(
      {
        userId,
        tokenHash,
        invitedById: invitedByUserId,
        expiresAt,
        lastSentAt: now,
        resendCount: priorResendCount + 1,
      },
      tx,
    );

    if (user.status === "INVITE_EXPIRED") {
      return authRepository.setUserStatus(userId, "INVITED", tx);
    }

    return authRepository.findUserById(userId, tx);
  });

  const setupUrl = setupUrlForClient(updatedUser.role?.name, rawToken);

  await sendEmail(
    "Invitation to join FEDARB",
    invitationTemplate(
      updatedUser.role?.name || "User",
      setupUrl,
      INVITATION_EXPIRES_IN_DAYS,
    ),
    updatedUser.email,
    "HTML",
  );

  return {
    user: sanitizeUser(updatedUser),
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

  if (user.status === "LOCKED") {
    const lockStillActive =
      user.lockedUntil && user.lockedUntil > new Date();

    if (lockStillActive) {
      throw new ApiError(
        403,
        `Account is locked. Please try again after ${user.lockedUntil.toISOString()}.`,
      );
    }

    await authRepository.unlockAccount(user.id);
    user.status = "ACTIVE";
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
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

  const roleName = user.role?.name || "User";
  const setupUrl = setupUrlForClient(
    roleName,
    rawToken,
    "password-reset-request",
  );

  await sendEmail(
    "Reset your FEDARB password",
    forgotPasswordTemplate(roleName, setupUrl, resetMinutes),
    normalizedEmail,
    "HTML",
  );

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

const changePassword = async ({ userId, currentPassword, newPassword }) => {
  const user = await authRepository.findUserById(userId);
  if (!user) {
    throw new ApiError(404, "User not found.");
  }
  if (!user.passwordHash) {
    throw new ApiError(400, "Password change is not available for this account.");
  }

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    throw new ApiError(400, "Current password is incorrect.");
  }

  if (currentPassword === newPassword) {
    throw new ApiError(
      400,
      "New password must be different from the current password.",
    );
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      lastPasswordChangeAt: new Date(),
      mustChangePassword: false,
    },
  });

  // Best-effort revoke of any tracked sessions (JWT auth may not persist sessions).
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokedReason: "PASSWORD_CHANGED",
    },
  });

  return { message: "Password changed successfully." };
};

const logout = async ({ userId, accessToken }) => {
  if (accessToken) {
    const accessTokenHash = hashToken(accessToken);
    await prisma.session.updateMany({
      where: {
        userId,
        accessTokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: "LOGOUT",
      },
    });
  }

  return { message: "Logged out successfully." };
};

module.exports = {
  setupUrlForClient,
  inviteUser,
  resendInvite,
  acceptInvitation,
  signIn,
  forgotPassword,
  resetPassword,
  changePassword,
  logout,
};
