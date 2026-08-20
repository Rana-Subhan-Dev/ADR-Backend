const prisma = require("../config/prisma");

const participantSelect = {
  id: true,
  caseId: true,
  role: true,
  isPrimary: true,
  accessStatus: true,
  invitationStatus: true,
  lastInviteSentAt: true,
  assignmentType: true,
  assignmentReason: true,
  revokeReason: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      lastLoginAt: true,
    },
  },
  attorney: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      lawFirm: { select: { id: true, name: true } },
    },
  },
  caseParty: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      organizationName: true,
      side: true,
    },
  },
};

const findParticipantById = (id) =>
  prisma.caseParticipant.findUnique({
    where: { id },
    select: participantSelect,
  });

const findParticipantByUserAndCase = (userId, caseId) =>
  prisma.caseParticipant.findFirst({
    where: { userId, caseId },
    select: participantSelect,
  });

const getParticipants = ({ where, skip, take }) =>
  prisma.$transaction([
    prisma.caseParticipant.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      select: participantSelect,
    }),
    prisma.caseParticipant.count({ where }),
  ]);

const createParticipant = (data, tx = prisma) =>
  tx.caseParticipant.create({ data, select: participantSelect });

const updateParticipant = (id, data, tx = prisma) =>
  tx.caseParticipant.update({ where: { id }, data, select: participantSelect });

const createUserWithInvitation = (
  { user, invitation, participant },
  tx = prisma,
) =>
  tx.user.create({
    data: {
      ...user,
      accountInvitationsReceived: { create: invitation },
      caseParticipations: { create: participant },
    },
    select: { id: true, email: true },
  });

const revokePendingInvitations = (userId, tx = prisma) =>
  tx.accountInvitation.updateMany({
    where: { userId, status: "PENDING" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });

const createAccountInvitation = (data, tx = prisma) =>
  tx.accountInvitation.create({ data });

const findAttorneyForCase = (attorneyId, caseId) =>
  prisma.attorney.findFirst({
    where: {
      id: attorneyId,
      representations: { some: { caseParty: { caseId } } },
    },
    select: { id: true },
  });

const findCasePartyForCase = (casePartyId, caseId) =>
  prisma.caseParty.findFirst({
    where: { id: casePartyId, caseId },
    select: { id: true },
  });

const neutralSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  neutralProfile: {
    select: {
      id: true,
      neutralType: true,
      specialties: true,
      credentials: true,
    },
  },
};

const findActiveNeutralByUserId = (id) =>
  prisma.user.findFirst({
    where: { id, status: "ACTIVE", role: { name: "NEUTRAL" } },
    select: neutralSelect,
  });

const getActiveNeutrals = () =>
  prisma.user.findMany({
    where: { status: "ACTIVE", role: { name: "NEUTRAL" } },
    select: neutralSelect,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

const findPrimaryNeutral = (caseId, tx = prisma) =>
  tx.caseParticipant.findFirst({
    where: { caseId, role: "NEUTRAL", isPrimary: true },
    select: participantSelect,
  });

module.exports = {
  findParticipantById,
  findParticipantByUserAndCase,
  getParticipants,
  createParticipant,
  updateParticipant,
  createUserWithInvitation,
  revokePendingInvitations,
  createAccountInvitation,
  findAttorneyForCase,
  findCasePartyForCase,
  findActiveNeutralByUserId,
  getActiveNeutrals,
  findPrimaryNeutral,
};
