const Joi = require("joi");

const {
  CASE_SORT_FIELDS,
  CaseType,
  CaseLifecycleStatus,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} = require("../constants/case.constants");

const createCaseSchema = Joi.object({
  title: Joi.string().trim().min(2).max(255),
  caseTitle: Joi.string().trim().min(2).max(255),
  summary: Joi.string().trim().min(10).max(10000).allow("", null),
  caseSummary: Joi.string().trim().min(10).max(10000).allow("", null),
  caseType: Joi.string().trim().max(100),
  caseTypeLabel: Joi.string().trim().max(100).allow("", null),
  disputeCategoryId: Joi.string().uuid().allow(null),
  disputeType: Joi.string().trim().max(50).allow("", null),
  disputePartyStructure: Joi.string()
    .valid("SINGLE_PARTY", "MULTI_PARTY", "single-party", "multi-party")
    .allow(null),
  jurisdiction: Joi.string().trim().max(255).allow("", null),
  referralSource: Joi.string().trim().max(255).allow("", null),
  isInternational: Joi.boolean(),
  isDraft: Joi.boolean().default(false),
  initialStatus: Joi.string().trim().max(50).allow("", null),
  lifecycleStatus: Joi.string()
    .valid(...Object.values(CaseLifecycleStatus))
    .optional(),
  caseManagerId: Joi.string().uuid(),
  assignedCaseManager: Joi.string().uuid(),
  assignedCaseManagerId: Joi.string().uuid(),
  neutralUserId: Joi.string().uuid().allow(null),
  assignedNeutral: Joi.string().uuid().allow(null),
  billingType: Joi.string().trim().max(50).allow("", null),
  payerResponsibility: Joi.string().trim().max(50).allow("", null),
  invoiceDeliveryContact: Joi.string().trim().max(255).allow("", null),
  taxApplicable: Joi.alternatives().try(Joi.boolean(), Joi.string().trim()),
  billingNotes: Joi.string().trim().max(1000).allow("", null),
  primaryMethod: Joi.string().trim().max(50).allow("", null),
  primaryCommunicationMethod: Joi.string()
    .valid("EMAIL", "PORTAL", "EMAIL_AND_PORTAL")
    .allow(null),
  notifyParticipants: Joi.array().items(Joi.string().trim()).optional(),
  lastContactDate: Joi.date().iso().allow(null),
  followUpDate: Joi.date().iso().allow(null),
  nextStep: Joi.string().trim().max(500).allow("", null),
})
  .or("title", "caseTitle")
  .custom((value, helpers) => {
    if (value.isDraft) return value;
    if (!value.caseType) {
      return helpers.message("caseType is required when not saving as draft.");
    }
    if (!(value.caseManagerId || value.assignedCaseManager || value.assignedCaseManagerId)) {
      return helpers.message("caseManagerId is required when not saving as draft.");
    }
    if (!(value.summary || value.caseSummary) || String(value.summary || value.caseSummary).trim().length < 10) {
      return helpers.message("caseSummary is required (min 10 characters) when not saving as draft.");
    }
    if (!value.jurisdiction) {
      return helpers.message("jurisdiction is required when not saving as draft.");
    }
    if (!(value.disputeType || value.disputePartyStructure)) {
      return helpers.message("disputeType is required when not saving as draft.");
    }
    return value;
  });

const getCasesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  search: Joi.string().trim().max(100).allow("").optional(),
  searchFields: Joi.string()
    .valid("all", "matter", "matter_name", "case_number", "casenumber", "party", "attorney")
    .default("all")
    .optional(),
  caseType: Joi.string()
    .valid(...Object.values(CaseType))
    .optional(),
  disputeCategoryId: Joi.string().uuid().optional(),
  lifecycleStatus: Joi.string()
    .valid(...Object.values(CaseLifecycleStatus))
    .optional(),
  caseManagerId: Joi.string().uuid().optional(),
  followUpDate: Joi.date().iso().optional(),
  assignedNeutralId: Joi.string().uuid().optional(),
  hearingDateFrom: Joi.date().iso().optional(),
  hearingDateTo: Joi.date().iso().optional(),
  caseStatus: Joi.string()
    .valid("Inquiry", "Case", "Post-hearing", "Closed", "inquiry", "case", "post-hearing", "closed")
    .optional(),
  stageId: Joi.string().uuid().optional(),
  stageName: Joi.string().trim().max(100).optional(),
  revenueStatus: Joi.string().trim().max(50).optional(),
  sortBy: Joi.string()
    .valid(...Object.values(CASE_SORT_FIELDS))
    .default(CASE_SORT_FIELDS.CREATED_AT),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

const caseIdSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

const updateCaseSchema = Joi.object({
  title: Joi.string().trim().min(2).max(255).optional(),
  caseTitle: Joi.string().trim().min(2).max(255).optional(),
  summary: Joi.string().trim().max(10000).allow("", null).optional(),
  caseSummary: Joi.string().trim().max(10000).allow("", null).optional(),
  caseType: Joi.string().trim().max(100).optional(),
  caseTypeLabel: Joi.string().trim().max(100).allow("", null).optional(),
  disputeCategoryId: Joi.string().uuid().allow(null).optional(),
  disputePartyStructure: Joi.string()
    .valid("SINGLE_PARTY", "MULTI_PARTY", "single-party", "multi-party")
    .allow(null)
    .optional(),
  jurisdiction: Joi.string().trim().max(255).allow("", null).optional(),
  referralSource: Joi.string().trim().max(255).allow("", null).optional(),
  isInternational: Joi.boolean().optional(),
  isDraft: Joi.boolean().optional(),
  caseManagerId: Joi.string().uuid().optional(),
  lastContactDate: Joi.date().iso().allow(null).optional(),
  followUpDate: Joi.date().iso().allow(null).optional(),
  nextStep: Joi.string().trim().max(500).allow("", null).optional(),
  primaryCommunicationMethod: Joi.string()
    .valid("EMAIL", "PORTAL", "EMAIL_AND_PORTAL")
    .allow(null)
    .optional(),
  notifyOnHearingScheduled: Joi.boolean().optional(),
  notifyOnDocumentUploaded: Joi.boolean().optional(),
  notifyOnCaseUpdate: Joi.boolean().optional(),
  notifyOnDocuSignSent: Joi.boolean().optional(),
}).min(1);

const updateCaseStatusSchema = Joi.object({
  lifecycleStatus: Joi.string()
    .valid(...Object.values(CaseLifecycleStatus))
    .required(),
  reason: Joi.string().trim().max(2000).allow("", null).optional(),
}).custom((value, helpers) => {
  if (value.lifecycleStatus === "CLOSED" && !value.reason) {
    return helpers.message("reason is required when setting status to CLOSED.");
  }
  return value;
});

const closeCaseSchema = Joi.object({
  closeDate: Joi.date().iso().optional(),
  closureSummary: Joi.string().trim().min(1).required(),
});

const reopenCaseSchema = Joi.object({
  reopenReason: Joi.string().trim().min(1).required(),
});

const messageAllPartiesSchema = Joi.object({
  recipientParticipantIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
  subject: Joi.string().trim().min(1).max(255).required(),
  body: Joi.string().trim().min(1).max(10000).required(),
});

module.exports = {
  createCaseSchema,
  getCasesSchema,
  caseIdSchema,
  updateCaseSchema,
  updateCaseStatusSchema,
  closeCaseSchema,
  reopenCaseSchema,
  messageAllPartiesSchema,
};
