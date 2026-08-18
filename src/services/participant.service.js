const crypto = require("crypto");
const prisma = require("../config/prisma");
const participantRepository = require("../repositories/participant.repository");
const authRepository = require("../repositories/auth.repository");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");
const { sendEmail } = require("../utils/sendEmail");
const { invitationTemplate } = require("../shared/emailTemplates/invitationEmail");
const { INVITATION_TOKEN_BYTES, INVITATION_EXPIRES_IN_DAYS } = require("../constants/auth.constants");

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const invitationExpiry = () => new Date(Date.now() + INVITATION_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);
const setupUrl = (token) => `${process.env.CLIENT_URL.replace(/\/$/, "")}/accept-invitation?token=${token}`;

const assertAssociations = async (data, caseId) => {
  if (data.attorneyId && !(await participantRepository.findAttorneyForCase(data.attorneyId, caseId))) {
    throw new ApiError(400, "Attorney is not linked to this case.");
  }
  if (data.casePartyId && !(await participantRepository.findCasePartyForCase(data.casePartyId, caseId))) {
    throw new ApiError(400, "Represented party is not linked to this case.");
  }
};

const getParticipant = async (caseId, participantId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const participant = await participantRepository.findParticipantById(participantId);
  if (!participant || participant.caseId !== caseId) throw new ApiError(404, "Participant not found.");
  return participant;
};

const getParticipants = async (caseId, query, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const where = { caseId };
  if (query.role) where.role = query.role;
  if (query.accessStatus) where.accessStatus = query.accessStatus;
  if (query.invitationStatus) where.invitationStatus = query.invitationStatus;
  if (query.search) {
    where.user = {
      OR: [
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ],
    };
  }
  const [participants, total] = await participantRepository.getParticipants({ where, skip: (page - 1) * limit, take: limit });
  const totalPages = Math.ceil(total / limit);
  return { participants, pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 } };
};

const inviteParticipant = async (caseId, data, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  await assertAssociations(data, caseId);
  const email = data.email.toLowerCase().trim();
  const existingUser = await authRepository.findUserByEmail(email);
  if (existingUser) {
    if (await participantRepository.findParticipantByUserAndCase(existingUser.id, caseId)) {
      throw new ApiError(409, "This user is already a participant in the case.");
    }
    if (existingUser.status !== "ACTIVE") {
      throw new ApiError(409, "This email already has a pending platform invitation.");
    }
    return participantRepository.createParticipant({
      userId: existingUser.id,
      caseId,
      role: data.role,
      attorneyId: data.attorneyId || null,
      casePartyId: data.casePartyId || null,
      assignmentReason: data.assignmentReason || null,
      assignmentType: "ASSIGNED",
      accessStatus: "ACTIVE",
      invitationStatus: "ACCEPTED",
    });
  }
  const role = await authRepository.findRoleByName(data.role);
  if (!role) throw new ApiError(400, "Participant role is not configured.");
  const token = crypto.randomBytes(INVITATION_TOKEN_BYTES).toString("hex");
  const sentAt = new Date();
  const user = await prisma.$transaction((tx) => participantRepository.createUserWithInvitation({
    user: {
      email,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone || null,
      userType: "EXTERNAL",
      roleId: role.id,
      status: "INVITED",
      invitedById: currentUser.id,
    },
    invitation: { tokenHash: hashToken(token), invitedById: currentUser.id, expiresAt: invitationExpiry(), lastSentAt: sentAt },
    participant: {
      caseId,
      role: data.role,
      attorneyId: data.attorneyId || null,
      casePartyId: data.casePartyId || null,
      assignmentReason: data.assignmentReason || null,
      assignmentType: "ASSIGNED",
      accessStatus: "ACTIVE",
      invitationStatus: "INVITED",
      lastInviteSentAt: sentAt,
    },
  }, tx));
  await sendEmail("Invitation to join FEDARB", invitationTemplate(data.role, setupUrl(token), INVITATION_EXPIRES_IN_DAYS), email, "HTML");
  const participant = await participantRepository.findParticipantByUserAndCase(user.id, caseId);
  return { ...participant, ...(process.env.NODE_ENV === "development" && { invitationToken: token }) };
};

const resendInvitation = async (caseId, participantId, currentUser) => {
  const participant = await getParticipant(caseId, participantId, currentUser);
  if (participant.invitationStatus !== "INVITED") throw new ApiError(400, "Only pending invitations can be resent.");
  const token = crypto.randomBytes(INVITATION_TOKEN_BYTES).toString("hex");
  const sentAt = new Date();
  await prisma.$transaction(async (tx) => {
    await participantRepository.revokePendingInvitations(participant.user.id, tx);
    await participantRepository.createAccountInvitation({ userId: participant.user.id, tokenHash: hashToken(token), invitedById: currentUser.id, expiresAt: invitationExpiry(), lastSentAt: sentAt, resendCount: 1 }, tx);
    await participantRepository.updateParticipant(participantId, { lastInviteSentAt: sentAt, invitationStatus: "INVITED", accessStatus: "ACTIVE" }, tx);
  });
  await sendEmail("Invitation to join FEDARB", invitationTemplate(participant.role, setupUrl(token), INVITATION_EXPIRES_IN_DAYS), participant.user.email, "HTML");
  const updated = await participantRepository.findParticipantById(participantId);
  return { ...updated, ...(process.env.NODE_ENV === "development" && { invitationToken: token }) };
};

const revokeInvitation = async (caseId, participantId, reason, currentUser) => {
  const participant = await getParticipant(caseId, participantId, currentUser);
  if (participant.invitationStatus !== "INVITED") throw new ApiError(400, "Only pending invitations can be revoked.");
  await prisma.$transaction(async (tx) => {
    await participantRepository.revokePendingInvitations(participant.user.id, tx);
    await participantRepository.updateParticipant(participantId, { invitationStatus: "REVOKED", accessStatus: "REVOKED", revokeReason: reason }, tx);
  });
  return participantRepository.findParticipantById(participantId);
};

const updateParticipant = async (caseId, participantId, data, currentUser) => {
  const participant = await getParticipant(caseId, participantId, currentUser);
  await assertAssociations(data, caseId);
  const { firstName, lastName, phone, ...participantData } = data;
  await prisma.$transaction(async (tx) => {
    if (firstName !== undefined || lastName !== undefined || phone !== undefined) {
      await tx.user.update({ where: { id: participant.user.id }, data: { ...(firstName !== undefined && { firstName }), ...(lastName !== undefined && { lastName }), ...(phone !== undefined && { phone }) } });
    }
    if (Object.keys(participantData).length) await participantRepository.updateParticipant(participantId, participantData, tx);
  });
  return participantRepository.findParticipantById(participantId);
};

const updateAccess = async (caseId, participantId, accessStatus, currentUser) => {
  await getParticipant(caseId, participantId, currentUser);
  return participantRepository.updateParticipant(participantId, { accessStatus });
};

const getAvailableNeutrals = async (caseId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  return participantRepository.getActiveNeutrals();
};

const assignNeutral = async (caseId, { neutralUserId, assignmentReason }, currentUser, requestMeta = {}) => {
  const caseData = await caseService.getCaseById(caseId, currentUser);
  const neutral = await participantRepository.findActiveNeutralByUserId(neutralUserId);
  if (!neutral) throw new ApiError(404, "Active neutral not found.");

  const result = await prisma.$transaction(async (tx) => {
    const previousParticipant = await participantRepository.findPrimaryNeutral(caseId, tx);
    let participant;

    if (previousParticipant?.user.id !== neutralUserId) {
      if (previousParticipant) {
        await participantRepository.updateParticipant(previousParticipant.id, { isPrimary: false, accessStatus: "INACTIVE" }, tx);
      }

      const existingParticipant = await tx.caseParticipant.findFirst({
        where: { caseId, userId: neutralUserId, role: "NEUTRAL" },
        select: { id: true },
      });

      participant = existingParticipant
        ? await participantRepository.updateParticipant(existingParticipant.id, { isPrimary: true, accessStatus: "ACTIVE", invitationStatus: "ACCEPTED", assignmentType: "ASSIGNED", assignmentReason, revokeReason: null }, tx)
        : await participantRepository.createParticipant({ userId: neutralUserId, caseId, role: "NEUTRAL", isPrimary: true, accessStatus: "ACTIVE", invitationStatus: "ACCEPTED", assignmentType: "ASSIGNED", assignmentReason }, tx);
    } else {
      participant = await participantRepository.updateParticipant(previousParticipant.id, { accessStatus: "ACTIVE", assignmentReason, revokeReason: null }, tx);
    }

    const previousNeutralName = previousParticipant ? `${previousParticipant.user.firstName} ${previousParticipant.user.lastName}` : null;
    const neutralName = `${neutral.firstName} ${neutral.lastName}`;
    await tx.caseTimelineEvent.create({
      data: {
        caseId,
        eventType: "NEUTRAL_ASSIGNED",
        relatedRecordType: "CaseParticipant",
        relatedRecordId: participant.id,
        previousValue: previousNeutralName,
        newValue: neutralName,
        summary: `${neutralName} assigned as the primary neutral for case ${caseData.caseNumber}.`,
        actorUserId: currentUser.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actingUserId: currentUser.id,
        actingUserRoleSnapshot: currentUser.role?.name,
        action: "ASSIGN",
        module: "CASES",
        affectedRecordType: "CaseParticipant",
        affectedRecordId: participant.id,
        previousValue: previousParticipant ? { participantId: previousParticipant.id, userId: previousParticipant.user.id } : undefined,
        newValue: { participantId: participant.id, userId: neutralUserId, role: "NEUTRAL", isPrimary: true },
        reason: assignmentReason,
        ipAddress: requestMeta.ipAddress || null,
        deviceInfo: requestMeta.userAgent || null,
      },
    });
    const inAppNotification = await tx.notification.create({
      data: {
        recipientUserId: neutralUserId,
        channel: "IN_APP",
        eventType: "NEUTRAL_ASSIGNED",
        subject: `Assigned to case ${caseData.caseNumber}`,
        templateData: { caseId, caseNumber: caseData.caseNumber, caseTitle: caseData.title, assignmentReason },
        relatedRecordType: "Case",
        relatedRecordId: caseId,
        deliveryStatus: "SENT",
        sentAt: new Date(),
      },
    });
    const emailNotification = await tx.notification.create({
      data: {
        recipientUserId: neutralUserId,
        channel: "EMAIL",
        eventType: "NEUTRAL_ASSIGNED",
        subject: `Assigned to case ${caseData.caseNumber}`,
        templateData: { caseId, caseNumber: caseData.caseNumber, caseTitle: caseData.title, assignmentReason },
        relatedRecordType: "Case",
        relatedRecordId: caseId,
      },
    });
    return { participant, inAppNotification, emailNotification };
  }, { timeout: 15000 });

  try {
    await sendEmail(`Assigned to case ${caseData.caseNumber}`, `You have been assigned as the primary neutral for ${caseData.caseNumber}: ${caseData.title}. Assignment reason: ${assignmentReason}`, neutral.email);
    await prisma.notification.update({ where: { id: result.emailNotification.id }, data: { deliveryStatus: "SENT", sentAt: new Date() } });
  } catch (error) {
    await prisma.notification.update({ where: { id: result.emailNotification.id }, data: { deliveryStatus: "FAILED", errorMessage: error.message } });
  }

  return { participant: result.participant, notifications: { inAppNotificationId: result.inAppNotification.id, emailNotificationId: result.emailNotification.id } };
};

module.exports = { inviteParticipant, getParticipants, getParticipant, resendInvitation, revokeInvitation, updateParticipant, updateAccess, getAvailableNeutrals, assignNeutral };
