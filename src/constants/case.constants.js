const { CaseType, CaseLifecycleStatus } = require("@prisma/client");

const CASE_SORT_FIELDS = {
  CREATED_AT: "createdAt",
  UPDATED_AT: "updatedAt",
  CASE_NUMBER: "caseNumber",
  TITLE: "title",
  LIFECYCLE_STATUS: "lifecycleStatus",
  CASE_TYPE: "caseType",
};

const CASE_PREFIXES = {
  [CaseType.MEDIATION]: "MED",
  [CaseType.ARBITRATION]: "ARB",
  [CaseType.HYBRID_ADR]: "HYB",
  [CaseType.CUSTOM_ADR]: "ADR",
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const CLOSURE_CHECKLIST_LABELS = [
  "Outcome Notes Added",
  "Final Hearing Completed",
  "Required Documents Uploaded",
  "Closure Eligibility Verified",
  "Feedback Forms Completed",
  "Accounting Audit Completed",
];

const CLOSURE_DERIVED_LABELS = new Set([
  "Outcome Notes Added",
  "Final Hearing Completed",
  "Required Documents Uploaded",
]);

/** Canonical readiness catalog (Figma / epic). */
const READINESS_CHECKLIST_DEFINITIONS = [
  {
    label: "Intake complete",
    type: "SYSTEM_DERIVED",
    relatedModule: "INTAKE",
  },
  {
    label: "Required case metadata entered",
    type: "SYSTEM_DERIVED",
    relatedModule: "CASES",
  },
  {
    label: "Parties added",
    type: "SYSTEM_DERIVED",
    relatedModule: "PARTIES",
  },
  {
    label: "Attorneys linked",
    type: "SYSTEM_DERIVED",
    relatedModule: "ATTORNEYS",
  },
  {
    label: "Neutral assigned",
    type: "SYSTEM_DERIVED",
    relatedModule: "PARTICIPANTS",
  },
  {
    label: "Participant invitations sent",
    type: "SYSTEM_DERIVED",
    relatedModule: "PARTICIPANTS",
  },
  {
    label: "Participant access accepted where needed",
    type: "SYSTEM_DERIVED",
    relatedModule: "PARTICIPANTS",
  },
  {
    label: "Required documents uploaded",
    type: "SYSTEM_DERIVED",
    relatedModule: "DOCUMENTS",
  },
  {
    label: "Document visibility reviewed",
    type: "MANUAL",
    relatedModule: "DOCUMENTS",
  },
  {
    label: "Hearing scheduled",
    type: "SYSTEM_DERIVED",
    relatedModule: "HEARINGS",
  },
  {
    label: "Calendar invites sent",
    type: "SYSTEM_DERIVED",
    relatedModule: "HEARINGS",
  },
  {
    label: "Zoom link generated",
    type: "SYSTEM_DERIVED",
    relatedModule: "HEARINGS",
  },
  {
    label: "DocuSign pending/completed where applicable",
    type: "SYSTEM_DERIVED",
    relatedModule: "DOCUSIGN",
    naWhenUnused: true,
  },
  {
    label: "Billing configured where applicable",
    type: "SYSTEM_DERIVED",
    relatedModule: "BILLING",
    naWhenUnused: true,
  },
  {
    label: "Deposit invoice sent, if applicable",
    type: "SYSTEM_DERIVED",
    relatedModule: "BILLING",
    naWhenUnused: true,
  },
  {
    label: "Status of deposit, if applicable",
    type: "SYSTEM_DERIVED",
    relatedModule: "BILLING",
    naWhenUnused: true,
  },
  {
    label: "Hearing ready",
    type: "MANUAL",
    relatedModule: "HEARINGS",
  },
  {
    label: "Outcome notes added",
    type: "SYSTEM_DERIVED",
    relatedModule: "NOTES",
  },
  {
    label: "Closure checklist complete",
    type: "SYSTEM_DERIVED",
    relatedModule: "CLOSURE",
  },
];

const READINESS_DERIVED_LABELS = new Set(
  READINESS_CHECKLIST_DEFINITIONS.filter((d) => d.type === "SYSTEM_DERIVED").map(
    (d) => d.label,
  ),
);

/** Neutrals may only see these readiness items (epic tailored view). */
const NEUTRAL_READINESS_LABELS = new Set([
  "Hearing scheduled",
  "Calendar invites sent",
  "Zoom link generated",
  "Hearing ready",
  "Outcome notes added",
  "Participant invitations sent",
  "Participant access accepted where needed",
]);

const CLOSABLE_STATUSES = new Set(["ACTIVE", "REOPENED"]);

module.exports = {
  CaseType,
  CaseLifecycleStatus,
  CASE_SORT_FIELDS,
  CASE_PREFIXES,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  CLOSURE_CHECKLIST_LABELS,
  CLOSURE_DERIVED_LABELS,
  READINESS_CHECKLIST_DEFINITIONS,
  READINESS_DERIVED_LABELS,
  NEUTRAL_READINESS_LABELS,
  CLOSABLE_STATUSES,
};
