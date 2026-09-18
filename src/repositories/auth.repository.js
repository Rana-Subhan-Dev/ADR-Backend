const prisma = require("../config/prisma");

const USER_WITH_ROLE_SELECT = {
  id: true,
  email: true,
  passwordHash: true,
  firstName: true,
  lastName: true,
  phone: true,
  jobTitle: true,
  userType: true,
  status: true,
  roleId: true,
  role: {
    select: {
      id: true,
      name: true,
    },
  },
  twoFactorEnabled: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  lastLoginAt: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
};

const findUserByEmail = async (email) => {
  return prisma.user.findUnique({
    where: { email },
    select: USER_WITH_ROLE_SELECT,
  });
};

const findUserById = async (id, tx = prisma) => {
  return tx.user.findUnique({
    where: { id },
    select: USER_WITH_ROLE_SELECT,
  });
};

const findRoleByName = async (name) => {
  return prisma.role.findUnique({
    where: { name },
  });
};

const createInvitedUser = async ({ data, invitation }, tx = prisma) => {
  return tx.user.create({
    data: {
      ...data,
      accountInvitationsReceived: {
        create: invitation,
      },
    },
    select: USER_WITH_ROLE_SELECT,
  });
};

const findInvitationByTokenHash = async (tokenHash) => {
  return prisma.accountInvitation.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: USER_WITH_ROLE_SELECT,
      },
    },
  });
};

const acceptInvitation = async ({
  invitationId,
  userId,
  firstName,
  lastName,
  phone,
  passwordHash,
}) => {
  return prisma.$transaction(async (tx) => {
    await tx.accountInvitation.update({
      where: { id: invitationId },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });

    const user = await tx.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        ...(phone !== undefined && { phone }),
        passwordHash,
        status: "ACTIVE",
        mustChangePassword: false,
        lastPasswordChangeAt: new Date(),
      },
      select: USER_WITH_ROLE_SELECT,
    });

    const invitedParticipants = await tx.caseParticipant.findMany({
      where: { userId, invitationStatus: "INVITED" },
      select: { id: true, caseId: true, role: true },
    });

    await tx.caseParticipant.updateMany({
      where: { userId, invitationStatus: "INVITED" },
      data: { invitationStatus: "ACCEPTED", accessStatus: "ACTIVE" },
    });

    for (const participant of invitedParticipants) {
      await tx.caseTimelineEvent.create({
        data: {
          caseId: participant.caseId,
          eventType: "PARTICIPANT_ACCESS_ACCEPTED",
          relatedRecordType: "CaseParticipant",
          relatedRecordId: participant.id,
          summary: `Participant access accepted (${participant.role}).`,
          actorUserId: userId,
        },
      });
    }

    return user;
  });
};

const recordLoginAttempt = async ({
  userId,
  emailAttempted,
  isSuccessful,
  failureReason,
  ipAddress,
  userAgent,
}) => {
  return prisma.loginAttempt.create({
    data: {
      userId,
      emailAttempted,
      isSuccessful,
      failureReason,
      ipAddress,
      userAgent,
    },
  });
};

const incrementFailedLoginAttempts = async (userId, { lockedUntil } = {}) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: { increment: 1 },
      ...(lockedUntil && { lockedUntil, status: "LOCKED" }),
    },
  });
};

const unlockAccount = async (userId) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      status: "ACTIVE",
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
};

const resetFailedLoginAttempts = async (userId) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      status: "ACTIVE",
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });
};

const createPasswordResetToken = async ({
  userId,
  tokenHash,
  expiresAt,
  requestedIp,
}) => {
  return prisma.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt, requestedIp },
  });
};

const findPasswordResetTokenByHash = async (tokenHash) => {
  return prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });
};

const invalidateUserResetTokens = async (userId) => {
  return prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
};

const markPasswordResetTokenUsed = async (id) => {
  return prisma.passwordResetToken.update({
    where: { id },
    data: { usedAt: new Date() },
  });
};

const resetPasswordWithToken = async ({ userId, passwordHash, tokenId }) => {
  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        lastPasswordChangeAt: new Date(),
      },
    });

    await tx.passwordResetToken.update({
      where: { id: tokenId },
      data: { usedAt: new Date() },
    });
  });
};

const revokePendingAccountInvitations = (userId, tx = prisma) =>
  tx.accountInvitation.updateMany({
    where: { userId, status: "PENDING" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });

const getLatestAccountInvitationResendCount = async (userId, tx = prisma) => {
  const latest = await tx.accountInvitation.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { resendCount: true },
  });
  return latest?.resendCount ?? 0;
};

const createAccountInvitation = (data, tx = prisma) =>
  tx.accountInvitation.create({ data });

const setUserStatus = (userId, status, tx = prisma) =>
  tx.user.update({
    where: { id: userId },
    data: { status },
    select: USER_WITH_ROLE_SELECT,
  });

module.exports = {
  findUserByEmail,
  findUserById,
  findRoleByName,
  createInvitedUser,
  findInvitationByTokenHash,
  acceptInvitation,
  recordLoginAttempt,
  incrementFailedLoginAttempts,
  unlockAccount,
  resetFailedLoginAttempts,
  createPasswordResetToken,
  findPasswordResetTokenByHash,
  invalidateUserResetTokens,
  markPasswordResetTokenUsed,
  resetPasswordWithToken,
  revokePendingAccountInvitations,
  getLatestAccountInvitationResendCount,
  createAccountInvitation,
  setUserStatus,
};
