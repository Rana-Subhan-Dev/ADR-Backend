const { CaseType } = require("../constants/case.constants");

const CASE_TYPE_ALIASES = {
  mediation: CaseType.MEDIATION,
  arbitration: CaseType.ARBITRATION,
  "hybrid-adr": CaseType.HYBRID_ADR,
  hybrid: CaseType.HYBRID_ADR,
  "hybrid adr": CaseType.HYBRID_ADR,
  "custom-adr": CaseType.CUSTOM_ADR,
  "custom adr": CaseType.CUSTOM_ADR,
  custom: CaseType.CUSTOM_ADR,
};

const normalizeCaseTypeInput = (raw) => {
  if (raw == null || raw === "") {
    return { caseType: undefined, caseTypeLabel: undefined };
  }

  const asString = String(raw).trim();
  const upper = asString.toUpperCase().replace(/[\s-]+/g, "_");

  if (Object.values(CaseType).includes(upper)) {
    return { caseType: upper, caseTypeLabel: undefined };
  }

  const alias = CASE_TYPE_ALIASES[asString.toLowerCase()];
  if (alias) {
    return { caseType: alias, caseTypeLabel: undefined };
  }

  return { caseType: CaseType.CUSTOM_ADR, caseTypeLabel: asString };
};

const emptyToNull = (value) => {
  if (value === "" || value === undefined) return null;
  return value;
};

const normalizeInquiryPayload = (body = {}) => {
  const {
    email,
    phone,
    cellPhone,
    initialContact,
    location,
    timeframeRequested,
    inquiryCaseNumber,
    disputeType,
    disputeCategoryName,
    assignedCaseManager,
    assignedCaseManagerId,
    assignedNeutrals,
    neutralUserIds,
    caseType: rawCaseType,
    caseTypeLabel: explicitLabel,
    contactEmail,
    contactPhone,
    contactCellPhone,
    clientReference,
    initialContactName,
    locationJurisdiction,
    timeFrameRequested,
    preliminaryCaseManagerId,
    ...rest
  } = body;

  const { caseType, caseTypeLabel } = normalizeCaseTypeInput(rawCaseType);

  const neutrals = neutralUserIds
    || (Array.isArray(assignedNeutrals) ? assignedNeutrals : undefined);

  return {
    ...rest,
    inquiryDate: rest.inquiryDate,
    matterName: rest.matterName,
    initialContactName: initialContactName || initialContact,
    contactEmail: contactEmail || email,
    contactPhone: contactPhone || phone,
    contactCellPhone: contactCellPhone || cellPhone,
    clientReference: clientReference || inquiryCaseNumber,
    locationJurisdiction: locationJurisdiction || location,
    timeFrameRequested: timeFrameRequested || timeframeRequested,
    caseType,
    caseTypeLabel: explicitLabel || caseTypeLabel || null,
    disputeCategoryId: rest.disputeCategoryId,
    disputeCategoryName: disputeCategoryName || disputeType || undefined,
    preliminaryCaseManagerId:
      preliminaryCaseManagerId || assignedCaseManagerId || assignedCaseManager || null,
    neutralUserIds: Array.isArray(neutrals)
      ? neutrals.filter((id) => typeof id === "string" && id.length > 0)
      : [],
  };
};

const normalizeCaseCreatePayload = (body = {}) => {
  const {
    caseTitle,
    title,
    caseSummary,
    summary,
    disputeType,
    disputePartyStructure,
    referralSource,
    initialStatus,
    assignedCaseManager,
    assignedCaseManagerId,
    caseManagerId,
    assignedNeutral,
    neutralUserId,
    billingType,
    payerResponsibility,
    invoiceDeliveryContact,
    taxApplicable,
    billingNotes,
    primaryMethod,
    primaryCommunicationMethod,
    notifyParticipants,
    caseType: rawCaseType,
    caseTypeLabel: explicitLabel,
    isDraft,
    ...rest
  } = body;

  const { caseType, caseTypeLabel } = normalizeCaseTypeInput(rawCaseType);

  const structureMap = {
    "single-party": "SINGLE_PARTY",
    single_party: "SINGLE_PARTY",
    SINGLE_PARTY: "SINGLE_PARTY",
    "multi-party": "MULTI_PARTY",
    multi_party: "MULTI_PARTY",
    MULTI_PARTY: "MULTI_PARTY",
  };

  const methodMap = {
    email: "EMAIL",
    portal: "PORTAL",
    "email + portal": "EMAIL_AND_PORTAL",
    "email+portal": "EMAIL_AND_PORTAL",
    EMAIL: "EMAIL",
    PORTAL: "PORTAL",
    EMAIL_AND_PORTAL: "EMAIL_AND_PORTAL",
  };

  const statusMap = {
    inquiry: "INTAKE",
    intake: "INTAKE",
    active: "ACTIVE",
    "pending scheduling": "SCHEDULED",
    scheduled: "SCHEDULED",
    "on hold": "ON_HOLD",
    drafts: "INTAKE",
    draft: "INTAKE",
  };

  const notify = Array.isArray(notifyParticipants) ? notifyParticipants : [];

  const billingTypeMap = {
    hourly: "HOURLY",
    flat: "FLAT",
    hybrid: "HYBRID",
    HOURLY: "HOURLY",
    FLAT: "FLAT",
    HYBRID: "HYBRID",
  };

  return {
    ...rest,
    title: title || caseTitle,
    summary: summary || caseSummary || null,
    caseType: caseType || rest.caseType,
    caseTypeLabel: explicitLabel || caseTypeLabel || null,
    disputePartyStructure:
      structureMap[disputePartyStructure]
      || structureMap[String(disputeType || "").toLowerCase()]
      || disputePartyStructure
      || null,
    referralSource: referralSource || null,
    lifecycleStatus: initialStatus
      ? statusMap[String(initialStatus).toLowerCase()] || initialStatus
      : rest.lifecycleStatus,
    isDraft: Boolean(isDraft),
    caseManagerId: caseManagerId || assignedCaseManagerId || assignedCaseManager,
    neutralUserId: neutralUserId || assignedNeutral || null,
    primaryCommunicationMethod:
      methodMap[String(primaryMethod || primaryCommunicationMethod || "").toLowerCase()]
      || primaryCommunicationMethod
      || null,
    notifyOnHearingScheduled: notify.includes("hearing-scheduled") || notify.includes("Hearing scheduled"),
    notifyOnDocumentUploaded: notify.includes("document-uploaded") || notify.includes("Document uploaded"),
    notifyOnCaseUpdate: notify.includes("case-update-posted") || notify.includes("Case update posted"),
    notifyOnDocuSignSent: notify.includes("docusign-sent") || notify.includes("DocuSign sent"),
    billingBootstrap: billingType || payerResponsibility || invoiceDeliveryContact || taxApplicable != null || billingNotes
      ? {
          billingType: billingTypeMap[String(billingType || "FLAT").toLowerCase()] || billingType || "FLAT",
          payerResponsibility: payerResponsibility || null,
          deliveryContactEmail: invoiceDeliveryContact || null,
          taxApplicability:
            taxApplicable === true
            || String(taxApplicable || "").toLowerCase() === "yes",
          billingNotes: billingNotes || null,
        }
      : null,
  };
};

const BILLING_TYPE_ALIASES = {
  hourly: "HOURLY",
  HOURLY: "HOURLY",
  daily: "HOURLY",
  Daily: "HOURLY",
  "flat rate": "FLAT",
  flat: "FLAT",
  FLAT: "FLAT",
  "flat_rate": "FLAT",
  hybrid: "HYBRID",
  HYBRID: "HYBRID",
  "hybrid (flat + overage)": "HYBRID",
  "hybrid flat + overage": "HYBRID",
  custom: "HYBRID",
};

const FEDARB_FEE_SCHEDULE_TYPE_ALIASES = {
  arbitration: "ARBITRATION",
  ARBITRATION: "ARBITRATION",
  mediation: "MEDIATION",
  MEDIATION: "MEDIATION",
  expert: "CUSTOM_ADR",
  EXPERT: "CUSTOM_ADR",
  custom_adr: "CUSTOM_ADR",
  CUSTOM_ADR: "CUSTOM_ADR",
  hybrid_adr: "HYBRID_ADR",
  HYBRID_ADR: "HYBRID_ADR",
};

const BILLING_MODE_ALIASES = {
  deposit_based: "DEPOSIT_BASED",
  DEPOSIT_BASED: "DEPOSIT_BASED",
  "deposit-based": "DEPOSIT_BASED",
  "deposit based": "DEPOSIT_BASED",
  standard: "STANDARD",
  STANDARD: "STANDARD",
  "progress billing": "MILESTONE",
  progress: "MILESTONE",
  milestone: "MILESTONE",
  MILESTONE: "MILESTONE",
  "final invoice only": "STANDARD",
  final: "STANDARD",
};

const BILLING_INPUT_SOURCE_ALIASES = {
  firm_invoice: "FIRM_INVOICE",
  FIRM_INVOICE: "FIRM_INVOICE",
  "firm invoice": "FIRM_INVOICE",
  firm: "FIRM_INVOICE",
  platform_timesheets: "PLATFORM_TIMESHEETS",
  PLATFORM_TIMESHEETS: "PLATFORM_TIMESHEETS",
  "platform timesheets": "PLATFORM_TIMESHEETS",
  platform: "PLATFORM_TIMESHEETS",
  timesheets: "PLATFORM_TIMESHEETS",
};

const EXPENSES_POLICY_ALIASES = {
  not_allowed: "NOT_ALLOWED",
  NOT_ALLOWED: "NOT_ALLOWED",
  "not allowed": "NOT_ALLOWED",
  no: "NOT_ALLOWED",
  allowed: "ALLOWED",
  ALLOWED: "ALLOWED",
  yes: "ALLOWED",
  billable_as_incurred: "BILLABLE_AS_INCURRED",
  BILLABLE_AS_INCURRED: "BILLABLE_AS_INCURRED",
  "allowed with receipts": "BILLABLE_AS_INCURRED",
  "allowed w/ receipts": "BILLABLE_AS_INCURRED",
};

const aliasLookup = (map, raw) => {
  if (raw == null || raw === "") return undefined;
  const asString = String(raw).trim();
  if (map[asString] != null) return map[asString];
  const lower = asString.toLowerCase();
  if (map[lower] != null) return map[lower];
  const underscored = lower.replace(/[\s-]+/g, "_");
  if (map[underscored] != null) return map[underscored];
  const upper = asString.toUpperCase().replace(/[\s-]+/g, "_");
  if (map[upper] != null) return map[upper];
  return asString;
};

const normalizeBillingTypeInput = (raw) => aliasLookup(BILLING_TYPE_ALIASES, raw);
const normalizeBillingModeInput = (raw) => aliasLookup(BILLING_MODE_ALIASES, raw);
const normalizeBillingInputSourceInput = (raw) =>
  aliasLookup(BILLING_INPUT_SOURCE_ALIASES, raw);
const normalizeExpensesPolicyInput = (raw) =>
  aliasLookup(EXPENSES_POLICY_ALIASES, raw);
const normalizeFedArbFeeScheduleTypeInput = (raw) =>
  aliasLookup(FEDARB_FEE_SCHEDULE_TYPE_ALIASES, raw);

const normalizeBillingConfigPayload = (body = {}) => {
  const next = { ...body };
  if (body.billingType != null) {
    next.billingType = normalizeBillingTypeInput(body.billingType);
  }
  if (body.billingMode != null) {
    next.billingMode = normalizeBillingModeInput(body.billingMode);
  }
  if (body.billingInputSource != null) {
    next.billingInputSource = normalizeBillingInputSourceInput(
      body.billingInputSource,
    );
  }
  if (body.expensesPolicy != null) {
    next.expensesPolicy = normalizeExpensesPolicyInput(body.expensesPolicy);
  }
  if (body.fedArbFeeScheduleType != null) {
    next.fedArbFeeScheduleType = normalizeFedArbFeeScheduleTypeInput(
      body.fedArbFeeScheduleType,
    );
  }
  if (Array.isArray(body.additionalTimekeepers)) {
    next.additionalTimekeepers = body.additionalTimekeepers.map((row) => ({
      ...row,
      expensesAllowed:
        row.expensesAllowed != null
          ? normalizeExpensesPolicyInput(row.expensesAllowed)
          : row.expensesAllowed,
    }));
  }
  return next;
};

module.exports = {
  normalizeCaseTypeInput,
  normalizeInquiryPayload,
  normalizeCaseCreatePayload,
  normalizeBillingTypeInput,
  normalizeBillingModeInput,
  normalizeBillingInputSourceInput,
  normalizeExpensesPolicyInput,
  normalizeFedArbFeeScheduleTypeInput,
  normalizeBillingConfigPayload,
  emptyToNull,
};
