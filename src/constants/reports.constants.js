/** Filter metadata helper */
const f = (key, label, type = "select") => ({ key, label, type });

/**
 * Report catalogue aligned with Case Manager + Accounting portals.
 * `filters` are objects; affinity / `supports` matches on `key`.
 */
const REPORT_DEFINITIONS = [
  {
    id: "case-status",
    name: "Case Status Report",
    reportName: "Case Status Report",
    category: "Operational",
    categoryLabel: "Operational / Matter Analysis",
    reportType: "operational",
    reportTypeLabel: "Operational",
    description:
      "Case pipeline snapshot with manager, neutral, status, and key dates.",
    keyFields: [
      "Case Type",
      "Case Manager",
      "Case Status",
      "Neutral",
      "Matter Name",
      "Next Hearing",
    ],
    keyDataFields: [
      "Case Type",
      "Case Manager",
      "Case Status",
      "Neutral",
      "Matter Name",
      "Next Hearing",
    ],
    permission: "ALL_USERS",
    permissionLabel: "All Users",
    dataset: "cases",
    filters: [
      f("dateFrom", "Date Range", "dateRange"),
      f("dateTo", "Date Range End", "date"),
      f("caseType", "Case Type"),
      f("lifecycleStatus", "Case Status"),
      f("caseStatus", "Case Status"),
      f("neutralUserId", "Neutral"),
      f("caseManagerUserId", "Case Manager"),
      f("disputeType", "Dispute Type"),
      f("search", "Search", "text"),
    ],
    generated: null,
  },
  {
    id: "dispute-type",
    name: "Dispute Type Report",
    reportName: "Dispute Type Report",
    category: "Operational",
    categoryLabel: "Operational / Matter Analysis",
    reportType: "operational",
    reportTypeLabel: "Operational",
    description: "Cases grouped by dispute type and category.",
    keyFields: ["Case Type", "Dispute Type", "Matter Name", "Case Status"],
    keyDataFields: ["Case Type", "Dispute Type", "Matter Name", "Case Status"],
    permission: "ALL_USERS",
    permissionLabel: "All Users",
    dataset: "cases",
    filters: [
      f("dateFrom", "Date Range", "dateRange"),
      f("dateTo", "Date Range End", "date"),
      f("caseType", "Case Type"),
      f("lifecycleStatus", "Case Status"),
      f("caseStatus", "Case Status"),
      f("disputeType", "Dispute Type"),
      f("search", "Search", "text"),
    ],
    generated: null,
  },
  {
    id: "inquiry-status",
    name: "Inquiry Status Report",
    reportName: "Inquiry Status Report",
    category: "Pipeline",
    categoryLabel: "Pipeline Reports",
    reportType: "pipeline",
    reportTypeLabel: "Pipeline",
    description: "Open and converted inquiries with status and dates.",
    keyFields: ["Matter Name", "Status", "Inquiry Date", "Case Number"],
    keyDataFields: ["Matter Name", "Status", "Inquiry Date", "Case Number"],
    permission: "ALL_USERS",
    permissionLabel: "All Users",
    dataset: "cases",
    filters: [
      f("dateFrom", "Date Range", "dateRange"),
      f("dateTo", "Date Range End", "date"),
      f("caseManagerUserId", "Case Manager"),
      f("search", "Search", "text"),
    ],
    generated: null,
  },
  {
    id: "all-contacts",
    name: "All Contacts Report",
    reportName: "All Contacts Report",
    category: "Contacts",
    categoryLabel: "Contact Reports",
    reportType: "contacts",
    reportTypeLabel: "Contact",
    description: "Directory of contacts with company and contact details.",
    keyFields: ["Contact Name", "Type", "Email", "Phone", "State"],
    keyDataFields: ["Contact Name", "Type", "Email", "Phone", "State"],
    permission: "ALL_USERS",
    permissionLabel: "All Users",
    dataset: "contacts",
    filters: [
      f("dateFrom", "Date Range", "dateRange"),
      f("dateTo", "Date Range End", "date"),
      f("state", "State"),
      f("role", "Role"),
      f("search", "Search", "text"),
    ],
    generated: null,
  },
  {
    id: "neutral-contact",
    name: "Neutral Contact Report",
    reportName: "Neutral Contact Report",
    category: "Contacts",
    categoryLabel: "Contact Reports",
    reportType: "contacts",
    reportTypeLabel: "Contact",
    description: "Neutral contacts only.",
    keyFields: ["Contact Name", "Email", "Phone", "Last Updated"],
    keyDataFields: ["Contact Name", "Email", "Phone", "Last Updated"],
    permission: "ALL_USERS",
    permissionLabel: "All Users",
    dataset: "contacts",
    filters: [
      f("dateFrom", "Date Range", "dateRange"),
      f("dateTo", "Date Range End", "date"),
      f("state", "State"),
      f("role", "Role"),
      f("search", "Search", "text"),
    ],
    generated: null,
  },
  {
    id: "hearings-upcoming",
    name: "Upcoming Hearings Report",
    reportName: "Upcoming Hearings Report",
    category: "Operational",
    categoryLabel: "Operational / Matter Analysis",
    reportType: "operational",
    reportTypeLabel: "Operational",
    description: "Scheduled hearings on accessible cases.",
    keyFields: [
      "Case Number",
      "Matter",
      "Hearing Date",
      "Neutral",
      "Location",
      "Status",
    ],
    keyDataFields: [
      "Case Number",
      "Matter",
      "Hearing Date",
      "Neutral",
      "Location",
      "Status",
    ],
    permission: "ALL_USERS",
    permissionLabel: "All Users",
    dataset: "cases",
    filters: [
      f("dateFrom", "Date Range", "dateRange"),
      f("dateTo", "Date Range End", "date"),
      f("caseType", "Case Type"),
      f("neutralUserId", "Neutral"),
      f("caseManagerUserId", "Case Manager"),
      f("search", "Search", "text"),
    ],
    generated: null,
  },
  {
    id: "invoices-overdue",
    name: "Overdue Invoices Report",
    reportName: "A/R Aging & Invoice Status Report",
    category: "Financial",
    categoryLabel: "Billing / Invoice Reports",
    reportType: "financial",
    reportTypeLabel: "Financial",
    description:
      "Invoices past due on accessible cases (due date + open balance).",
    keyFields: [
      "Case / Matter",
      "Neutral",
      "Amount",
      "Payment Status",
      "Due Date",
    ],
    keyDataFields: [
      "Case / Matter",
      "Neutral",
      "Amount",
      "Payment Status",
      "Due Date",
    ],
    permission: "PERMISSION_REQUIRED",
    permissionLabel: "Permission Required",
    dataset: "financial",
    filters: [
      f("dateFrom", "Date Range", "dateRange"),
      f("dateTo", "Date Range End", "date"),
      f("paymentStatus", "Payment Status"),
      f("agingBucket", "Aging Bucket"),
      f("caseType", "Case Type"),
      f("neutralUserId", "Neutral"),
      f("search", "Search", "text"),
      // Affinity-only dimensions for Accounting catalogue discovery
      f("revenueStatus", "Revenue Status"),
      f("depositStatus", "Deposit Status"),
    ],
    generated: null,
  },
];

const CATEGORY_ALIASES = {
  operational: "Operational",
  "operational / matter analysis": "Operational",
  pipeline: "Pipeline",
  "pipeline reports": "Pipeline",
  contacts: "Contacts",
  "contact reports": "Contacts",
  "contact reports / book list": "Contacts",
  financial: "Financial",
  "billing / invoice reports": "Financial",
  "deposit reports": "Financial",
  "fee reports": "Financial",
  "reconciliation reports": "Financial",
  "inquiry reports": "Pipeline",
};

const REPORT_TYPE_ALIASES = {
  operational: "operational",
  pipeline: "pipeline",
  contacts: "contacts",
  contact: "contacts",
  financial: "financial",
  compliance: "operational",
};

const SUPPORTS_ALIASES = {
  state: "state",
  neutral: "neutralUserId",
  neutraluserid: "neutralUserId",
  casetype: "caseType",
  disputetype: "disputeType",
  casestatus: "lifecycleStatus",
  lifecyclestatus: "lifecycleStatus",
  revenuestatus: "revenueStatus",
  depositstatus: "depositStatus",
  aging: "agingBucket",
  agingbucket: "agingBucket",
  date: "dateFrom",
  daterange: "dateFrom",
  datefrom: "dateFrom",
  dateto: "dateTo",
  casemanager: "caseManagerUserId",
  casemanageruserid: "caseManagerUserId",
};

const getReportDefinition = (reportId) =>
  REPORT_DEFINITIONS.find((report) => report.id === reportId) || null;

const filterKeys = (report) =>
  (report.filters || []).map((entry) =>
    typeof entry === "string" ? entry : entry.key,
  );

const normalizeSupportsKey = (raw) => {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  return SUPPORTS_ALIASES[key] || String(raw || "").trim();
};

const normalizeCategoryQuery = (raw) => {
  if (!raw) return null;
  const mapped = CATEGORY_ALIASES[String(raw).trim().toLowerCase()];
  return mapped || String(raw).trim();
};

const normalizeReportTypeQuery = (raw) => {
  if (!raw) return null;
  const mapped = REPORT_TYPE_ALIASES[String(raw).trim().toLowerCase()];
  return mapped || String(raw).trim().toLowerCase();
};

module.exports = {
  REPORT_DEFINITIONS,
  getReportDefinition,
  filterKeys,
  normalizeSupportsKey,
  normalizeCategoryQuery,
  normalizeReportTypeQuery,
  CATEGORY_ALIASES,
  REPORT_TYPE_ALIASES,
  SUPPORTS_ALIASES,
};
