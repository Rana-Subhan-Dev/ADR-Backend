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

module.exports = {
  CaseType,
  CaseLifecycleStatus,
  CASE_SORT_FIELDS,
  CASE_PREFIXES,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
