const crypto = require("crypto");
const prisma = require("../config/prisma");
const { CaseParticipantRole } = require("@prisma/client");
const participantRepository = require("../repositories/participant.repository");
const authRepository = require("../repositories/auth.repository");
const caseService = require("./case.service");
const { accessibleCaseWhere } = require("../utils/caseAccess");
const ApiError = require("../utils/apiError");
const { setupUrlForClient } = require("./auth.service");
const { sendEmail } = require("../utils/sendEmail");
const {
  invitationTemplate,
} = require("../shared/emailTemplates/invitationEmail");
const {
  INVITATION_TOKEN_BYTES,
  INVITATION_EXPIRES_IN_DAYS,
} = require("../constants/auth.constants");
const notificationService = require("./notification.service");

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
const invitationExpiry = () =>
  new Date(Date.now() + INVITATION_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

const assertAssociations = async (data, caseId) => {
  if (
    data.attorneyId &&
    !(await participantRepository.findAttorneyForCase(data.attorneyId, caseId))
  ) {
    throw new ApiError(400, "Attorney is not linked to this case.");
  }
  if (
    data.casePartyId &&
    !(await participantRepository.findCasePartyForCase(
      data.casePartyId,
      caseId,
    ))
  ) {
    throw new ApiError(400, "Represented party is not linked to this case.");
  }
};

const formatPersonName = (user) => {
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || null;
};

const formatPartyName = (party) => {
  if (!party) return null;
  if (party.organizationName) return party.organizationName;
  return (
    [party.firstName, party.lastName].filter(Boolean).join(" ").trim() || null
  );
};

const mapParticipantDto = (participant) => {
  if (!participant) return participant;
  return {
    ...participant,
    name: formatPersonName(participant.user),
    phone: participant.user?.phone ?? null,
    lastLogin: participant.user?.lastLoginAt ?? null,
    lastInviteSent: participant.lastInviteSentAt ?? null,
    firm: participant.attorney?.lawFirm?.name ?? null,
    representedParty: formatPartyName(participant.caseParty),
    caseNumber: participant.case?.caseNumber ?? null,
    caseTitle: participant.case?.title ?? null,
  };
};

const getParticipant = async (caseId, participantId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const participant =
    await participantRepository.findParticipantById(participantId);
  if (!participant || participant.caseId !== caseId)
    throw new ApiError(404, "Participant not found.");
  return mapParticipantDto(participant);
};

const paginateParticipants = async (where, query, hub = false) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;
  const [participants, total] = await participantRepository.getParticipants({
    where,
    skip: (page - 1) * limit,
    take: limit,
    hub,
  });
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    participants: participants.map(mapParticipantDto),
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

const getParticipants = async (caseId, query, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const where = { caseId };
  if (query.role) where.role = query.role;
  if (query.accessStatus) where.accessStatus = query.accessStatus;
  if (query.invitationStatus) where.invitationStatus = query.invitationStatus;
  if (query.search) {
    const term = { contains: query.search, mode: "insensitive" };
    const roleGuess = query.search.toUpperCase().replace(/[\s-]+/g, "_");
    const roleOr = Object.values(CaseParticipantRole).includes(roleGuess)
      ? [{ role: roleGuess }]
      : [];
    where.OR = [
      {
        user: {
          OR: [{ firstName: term }, { lastName: term }, { email: term }],
        },
      },
      { attorney: { lawFirm: { name: term } } },
      { caseParty: { organizationName: term } },
      ...roleOr,
    ];
  }
  return paginateParticipants(where, query, false);
};

const listParticipantsHub = async (query, currentUser) => {
  const caseScope = accessibleCaseWhere(currentUser);
  const caseFilter = Object.keys(caseScope).length ? { case: caseScope } : {};
  const where = {
    ...(query.role && { role: query.role }),
    ...(query.accessStatus && { accessStatus: query.accessStatus }),
    ...(query.invitationStatus && {
      invitationStatus: query.invitationStatus,
    }),
    ...(query.caseId && { caseId: query.caseId }),
  };
  if (query.search) {
    const term = { contains: query.search, mode: "insensitive" };
    const roleGuess = query.search.toUpperCase().replace(/[\s-]+/g, "_");
    const roleOr = Object.values(CaseParticipantRole).includes(roleGuess)
      ? [{ role: roleGuess }]
      : [];
    where.AND = [
      ...(Object.keys(caseFilter).length ? [caseFilter] : []),
      {
        OR: [
          {
            user: {
              OR: [{ firstName: term }, { lastName: term }, { email: term }],
            },
          },
          { case: { OR: [{ caseNumber: term }, { title: term }] } },
          { attorney: { lawFirm: { name: term } } },
          { caseParty: { organizationName: term } },
          ...roleOr,
        ],
      },
    ];
  } else {
    Object.assign(where, caseFilter);
  }
  return paginateParticipants(where, query, true);
};

const inviteParticipant = async (caseId, data, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  await assertAssociations(data, caseId);
  const email = data.email.toLowerCase().trim();
  const existingUser = await authRepository.findUserByEmail(email);
  if (existingUser) {
    if (
      await participantRepository.findParticipantByUserAndCase(
        existingUser.id,
        caseId,
      )
    ) {
      throw new ApiError(
        409,
        "This user is already a participant in the case.",
      );
    }
    if (existingUser.status !== "ACTIVE") {
      throw new ApiError(
        409,
        "This email already has a pending platform invitation.",
      );
    }
    const created = await participantRepository.createParticipant({
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
    await prisma.caseTimelineEvent.create({
      data: {
        caseId,
        eventType: "PARTICIPANT_INVITED",
        relatedRecordType: "CaseParticipant",
        relatedRecordId: created.id,
        summary: `Participant assigned: ${email} (${data.role}).`,
        actorUserId: currentUser.id,
      },
    });
    return created;
  }
  const role = await authRepository.findRoleByName(data.role);
  if (!role) throw new ApiError(400, "Participant role is not configured.");
  const token = crypto.randomBytes(INVITATION_TOKEN_BYTES).toString("hex");
  const sentAt = new Date();
  const user = await prisma.$transaction((tx) =>
    participantRepository.createUserWithInvitation(
      {
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
        invitation: {
          tokenHash: hashToken(token),
          invitedById: currentUser.id,
          expiresAt: invitationExpiry(),
          lastSentAt: sentAt,
        },
        participant: {
          caseId,
          role: data.role,
          attorneyId: data.attorneyId || null,
          casePartyId: data.casePartyId || null,
          assignmentReason: data.assignmentReason || null,
          assignmentType: "ASSIGNED",
          accessStatus: "INACTIVE",
          invitationStatus: "INVITED",
          lastInviteSentAt: sentAt,
        },
      },
      tx,
    ),
  );
  const setupUrl = setupUrlForClient(data.role, token);
  await sendEmail(
    "Invitation to join FEDARB",
    invitationTemplate(data.role, setupUrl, INVITATION_EXPIRES_IN_DAYS),
    email,
    "HTML",
  );
  const participant = await participantRepository.findParticipantByUserAndCase(
    user.id,
    caseId,
  );
  await prisma.caseTimelineEvent.create({
    data: {
      caseId,
      eventType: "PARTICIPANT_INVITED",
      relatedRecordType: "CaseParticipant",
      relatedRecordId: participant.id,
      summary: `Participant invited: ${email} (${data.role}).`,
      actorUserId: currentUser.id,
    },
  });
  await notificationService.notifyCaseManagers(caseId, {
    eventType: "PARTICIPANT_INVITED",
    subject: `Participant invited: ${email}`,
    relatedRecordType: "Case",
    relatedRecordId: caseId,
    templateData: {
      title: "Participant invited",
      message: `${email} was invited as ${data.role}.`,
      kind: "PARTICIPANT_INVITED",
      href: `/case-manager/cases/${caseId}`,
    },
  });
  return {
    ...mapParticipantDto(participant),
    ...(process.env.NODE_ENV === "development" && { invitationToken: token }),
  };
};

const resendInvitation = async (caseId, participantId, currentUser) => {
  const participant = await getParticipant(caseId, participantId, currentUser);
  const allowedStatuses = ["INVITED", "NOT_INVITED", "REVOKED", "EXPIRED"];
  if (!allowedStatuses.includes(participant.invitationStatus)) {
    throw new ApiError(
      400,
      "Invitation can only be sent when status is Not Invited, Invited, Expired, or Revoked.",
    );
  }
  if (participant.user?.status === "ACTIVE" && participant.invitationStatus === "ACCEPTED") {
    throw new ApiError(400, "Participant already accepted the invitation.");
  }
  const token = crypto.randomBytes(INVITATION_TOKEN_BYTES).toString("hex");
  const sentAt = new Date();
  await prisma.$transaction(async (tx) => {
    await participantRepository.revokePendingInvitations(
      participant.user.id,
      tx,
    );
    await participantRepository.createAccountInvitation(
      {
        userId: participant.user.id,
        tokenHash: hashToken(token),
        invitedById: currentUser.id,
        expiresAt: invitationExpiry(),
        lastSentAt: sentAt,
        resendCount: 1,
      },
      tx,
    );
    await participantRepository.updateParticipant(
      participantId,
      {
        lastInviteSentAt: sentAt,
        invitationStatus: "INVITED",
        accessStatus: "INACTIVE",
        revokeReason: null,
      },
      tx,
    );
    if (participant.user.status !== "ACTIVE") {
      await tx.user.update({
        where: { id: participant.user.id },
        data: { status: "INVITED" },
      });
    }
  });
  const setupUrl = setupUrlForClient(participant.role, token);
  await sendEmail(
    "Invitation to join FEDARB",
    invitationTemplate(
      participant.role,
      setupUrl,
      INVITATION_EXPIRES_IN_DAYS,
    ),
    participant.user.email,
    "HTML",
  );
  const updated =
    await participantRepository.findParticipantById(participantId);
  return {
    ...mapParticipantDto(updated),
    ...(process.env.NODE_ENV === "development" && { invitationToken: token }),
  };
};

const revokeInvitation = async (
  caseId,
  participantId,
  reason,
  currentUser,
  details,
) => {
  const participant = await getParticipant(caseId, participantId, currentUser);
  if (!["INVITED", "NOT_INVITED"].includes(participant.invitationStatus))
    throw new ApiError(400, "Only pending invitations can be revoked.");
  const revokeReason = details
    ? `${reason}${reason ? ": " : ""}${details}`.trim()
    : reason;
  await prisma.$transaction(async (tx) => {
    await participantRepository.revokePendingInvitations(
      participant.user.id,
      tx,
    );
    await participantRepository.updateParticipant(
      participantId,
      {
        invitationStatus: "REVOKED",
        accessStatus: "REVOKED",
        revokeReason,
      },
      tx,
    );
  });
  return mapParticipantDto(
    await participantRepository.findParticipantById(participantId),
  );
};

const updateParticipant = async (caseId, participantId, data, currentUser) => {
  const participant = await getParticipant(caseId, participantId, currentUser);
  await assertAssociations(data, caseId);
  const { firstName, lastName, phone, ...participantData } = data;
  await prisma.$transaction(async (tx) => {
    if (
      firstName !== undefined ||
      lastName !== undefined ||
      phone !== undefined
    ) {
      await tx.user.update({
        where: { id: participant.user.id },
        data: {
          ...(firstName !== undefined && { firstName }),
          ...(lastName !== undefined && { lastName }),
          ...(phone !== undefined && { phone }),
        },
      });
    }
    if (Object.keys(participantData).length)
      await participantRepository.updateParticipant(
        participantId,
        participantData,
        tx,
      );
  });
  return mapParticipantDto(
    await participantRepository.findParticipantById(participantId),
  );
};

const getParticipantInvitations = async (
  caseId,
  participantId,
  currentUser,
) => {
  const participant = await getParticipant(caseId, participantId, currentUser);
  const invitations = await participantRepository.findInvitationsByUserId(
    participant.user.id,
  );
  return {
    participantId: participant.id,
    invitations: invitations.map((row) => ({
      id: row.id,
      status: row.status,
      sentAt: row.lastSentAt,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      resendCount: row.resendCount,
      invitedBy: row.invitedBy
        ? {
            id: row.invitedBy.id,
            name: formatPersonName(row.invitedBy),
            email: row.invitedBy.email,
          }
        : null,
    })),
  };
};

const updateAccess = async (
  caseId,
  participantId,
  accessStatus,
  currentUser,
) => {
  await getParticipant(caseId, participantId, currentUser);
  return participantRepository.updateParticipant(participantId, {
    accessStatus,
  });
};

const getAvailableNeutrals = async (caseId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  return participantRepository.getActiveNeutrals();
};

const assignNeutral = async (
  caseId,
  { neutralUserId, assignmentReason },
  currentUser,
  requestMeta = {},
) => {
  const caseData = await caseService.getCaseById(caseId, currentUser);
  const neutral =
    await participantRepository.findActiveNeutralByUserId(neutralUserId);
  if (!neutral) throw new ApiError(404, "Active neutral not found.");

  const result = await prisma.$transaction(
    async (tx) => {
      const previousParticipant =
        await participantRepository.findPrimaryNeutral(caseId, tx);
      let participant;

      if (previousParticipant?.user.id !== neutralUserId) {
        if (previousParticipant) {
          await participantRepository.updateParticipant(
            previousParticipant.id,
            { isPrimary: false, accessStatus: "INACTIVE" },
            tx,
          );
        }

        const existingParticipant = await tx.caseParticipant.findFirst({
          where: { caseId, userId: neutralUserId, role: "NEUTRAL" },
          select: { id: true },
        });

        participant = existingParticipant
          ? await participantRepository.updateParticipant(
              existingParticipant.id,
              {
                isPrimary: true,
                accessStatus: "ACTIVE",
                invitationStatus: "ACCEPTED",
                assignmentType: "ASSIGNED",
                assignmentReason,
                revokeReason: null,
              },
              tx,
            )
          : await participantRepository.createParticipant(
              {
                userId: neutralUserId,
                caseId,
                role: "NEUTRAL",
                isPrimary: true,
                accessStatus: "ACTIVE",
                invitationStatus: "ACCEPTED",
                assignmentType: "ASSIGNED",
                assignmentReason,
              },
              tx,
            );
      } else {
        participant = await participantRepository.updateParticipant(
          previousParticipant.id,
          { accessStatus: "ACTIVE", assignmentReason, revokeReason: null },
          tx,
        );
      }

      const previousNeutralName = previousParticipant
        ? `${previousParticipant.user.firstName} ${previousParticipant.user.lastName}`
        : null;
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
          previousValue: previousParticipant
            ? {
                participantId: previousParticipant.id,
                userId: previousParticipant.user.id,
              }
            : undefined,
          newValue: {
            participantId: participant.id,
            userId: neutralUserId,
            role: "NEUTRAL",
            isPrimary: true,
          },
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
          templateData: {
            caseId,
            caseNumber: caseData.caseNumber,
            caseTitle: caseData.title,
            assignmentReason,
          },
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
          templateData: {
            caseId,
            caseNumber: caseData.caseNumber,
            caseTitle: caseData.title,
            assignmentReason,
          },
          relatedRecordType: "Case",
          relatedRecordId: caseId,
        },
      });
      return { participant, inAppNotification, emailNotification };
    },
    { timeout: 15000 },
  );

  try {
    await sendEmail(
      `Assigned to case ${caseData.caseNumber}`,
      `You have been assigned as the primary neutral for ${caseData.caseNumber}: ${caseData.title}. Assignment reason: ${assignmentReason}`,
      neutral.email,
    );
    await prisma.notification.update({
      where: { id: result.emailNotification.id },
      data: { deliveryStatus: "SENT", sentAt: new Date() },
    });
  } catch (error) {
    await prisma.notification.update({
      where: { id: result.emailNotification.id },
      data: { deliveryStatus: "FAILED", errorMessage: error.message },
    });
  }

  return {
    participant: result.participant,
    notifications: {
      inAppNotificationId: result.inAppNotification.id,
      emailNotificationId: result.emailNotification.id,
    },
  };
};

module.exports = {
  inviteParticipant,
  getParticipants,
  listParticipantsHub,
  getParticipant,
  getParticipantInvitations,
  resendInvitation,
  revokeInvitation,
  updateParticipant,
  updateAccess,
  getAvailableNeutrals,
  assignNeutral,
};
