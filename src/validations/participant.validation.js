const Joi = require("joi");
const {
  CaseParticipantRole,
  CaseParticipantAccessStatus,
  CaseParticipantInvitationStatus,
} = require("@prisma/client");

const participantRoles = [
  CaseParticipantRole.NEUTRAL,
  CaseParticipantRole.LAWYER,
  CaseParticipantRole.CLIENT,
];

const phone = Joi.string().trim().pattern(/^[0-9+\-\s()]+$/).max(50).allow("", null).optional();

const caseIdSchema = Joi.object({ caseId: Joi.string().uuid().required() });
const participantIdSchema = Joi.object({ caseId: Joi.string().uuid().required(), participantId: Joi.string().uuid().required() });

const inviteParticipantSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(100).required(),
  lastName: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().trim().lowercase().required(),
  phone,
  role: Joi.string().valid(...participantRoles).required(),
  attorneyId: Joi.string().uuid().allow(null).optional(),
  casePartyId: Joi.string().uuid().allow(null).optional(),
  assignmentReason: Joi.string().trim().max(1000).allow("", null).optional(),
});

const updateParticipantSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(100).optional(),
  lastName: Joi.string().trim().min(2).max(100).optional(),
  phone,
  attorneyId: Joi.string().uuid().allow(null).optional(),
  casePartyId: Joi.string().uuid().allow(null).optional(),
  assignmentReason: Joi.string().trim().max(1000).allow("", null).optional(),
}).min(1);

const getParticipantsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(100).allow("").optional(),
  role: Joi.string().valid(...Object.values(CaseParticipantRole)).optional(),
  accessStatus: Joi.string().valid(...Object.values(CaseParticipantAccessStatus)).optional(),
  invitationStatus: Joi.string().valid(...Object.values(CaseParticipantInvitationStatus)).optional(),
});

const revokeParticipantSchema = Joi.object({ reason: Joi.string().trim().min(2).max(1000).required() });
const updateAccessSchema = Joi.object({ accessStatus: Joi.string().valid(CaseParticipantAccessStatus.ACTIVE, CaseParticipantAccessStatus.INACTIVE).required() });
const assignNeutralSchema = Joi.object({
  neutralUserId: Joi.string().uuid().required(),
  assignmentReason: Joi.string().trim().min(2).max(1000).required(),
});

module.exports = {
  caseIdSchema,
  participantIdSchema,
  inviteParticipantSchema,
  updateParticipantSchema,
  getParticipantsSchema,
  revokeParticipantSchema,
  updateAccessSchema,
  assignNeutralSchema,
};
