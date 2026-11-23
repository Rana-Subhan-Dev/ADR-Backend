/**
 * One-time Salesforce matters import.
 *
 * Reads Salesforce_Matters_Export.xlsx (Matters, Matter Contacts, Parties & Billing)
 * and loads the matters into the DB under ONE case manager account.
 *
 * Usage:
 *   SF_CASE_MANAGER_EMAIL=user@example.com node prisma/seed-salesforce.js [--dry-run] [--file=path.xlsx]
 *   node prisma/seed-salesforce.js --rollback=<migrationBatchId>
 *   SF_CASE_MANAGER_EMAIL=... node prisma/seed-salesforce.js --backfill-billing
 *     (adds missing BillingConfiguration to already-imported cases; nothing else changes)
 *   SF_CASE_MANAGER_EMAIL=... node prisma/seed-salesforce.js --backfill-parties
 *     (replaces "Plaintiff side"/"Defendant side" placeholders, or adds missing parties, using
 *      the Plaintiff Counsel / Defendant Counsel text; both backfill flags can be combined)
 *
 * Notes:
 *  - Writes directly through Prisma. No invitations, emails, DocuSign or calendar syncs.
 *  - Business Development and Inquiry matters are skipped.
 *  - Idempotent: matters whose Salesforce ID already exists as Case.legacyReferenceId are skipped.
 *  - No users are created. Only the case manager (and neutrals matched by email) get CaseParticipant rows.
 */
require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const ExcelJS = require("exceljs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const DRY_RUN = flag("dry-run");
const ROLLBACK_BATCH = opt("rollback");
const BACKFILL_BILLING = flag("backfill-billing");
const BACKFILL_PARTIES = flag("backfill-parties");
const FILE_PATH = path.resolve(
  opt("file") || path.join(__dirname, "..", "Salesforce_Matters_Export.xlsx"),
);
const CASE_MANAGER_EMAIL = (process.env.SF_CASE_MANAGER_EMAIL || "")
  .trim()
  .toLowerCase();

const SKIPPED_STATUSES = new Set(["Business Development", "Inquiry"]);
const PLACEHOLDER_SPECIAL = "Special instructions for judges/neutrals go here";

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------
const cellValue = (v) => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if (v.result !== undefined) return cellValue(v.result);
    if (v.text !== undefined) return cellValue(v.text);
    return null;
  }
  return v;
};

const str = (v) => {
  const x = cellValue(v);
  if (x === null || x === undefined) return null;
  const s = (x instanceof Date ? x.toISOString() : String(x)).trim();
  return s === "" ? null : s;
};

const decodeEntities = (s) =>
  s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");

const stripHtml = (v) => {
  const s = str(v);
  if (!s) return null;
  if (!/<[a-z!/][^>]*>/i.test(s)) return s;
  const out = decodeEntities(
    s
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out || null;
};

const num = (v) => {
  const x = cellValue(v);
  if (x === null || x === undefined || x === "") return null;
  const n = typeof x === "number" ? x : Number(String(x).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const dateFrom = (v) => {
  const x = cellValue(v);
  if (x === null || x === undefined || x === "") return null;
  if (x instanceof Date) return Number.isNaN(x.getTime()) ? null : x;
  if (typeof x === "number" || /^\d+(\.\d+)?$/.test(String(x))) {
    const serial = Number(x);
    if (serial < 1 || serial > 80000) return null;
    return new Date(Math.round((serial - 25569) * 86400000));
  }
  const d = new Date(String(x));
  return Number.isNaN(d.getTime()) ? null : d;
};

const money = (v) => {
  const n = num(v);
  return n === null ? null : Math.round(n * 100) / 100;
};

const lc = (s) => (s || "").toLowerCase();

const withTime = (date, timeText) => {
  if (!date || !timeText) return null;
  const m = String(timeText).match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const mer = lc(m[3]);
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  const d = new Date(date);
  d.setUTCHours(h, min, 0, 0);
  return d;
};

const splitName = (full) => {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Unknown", lastName: "-" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "-" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) };
};

// ---------------------------------------------------------------------------
// Excel reading (streaming; Matters sheet is ~27MB of XML)
// ---------------------------------------------------------------------------
const readWorkbook = async (file) => {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, {
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
  });

  // The streaming reader does not expose sheet names, so rely on sheet order
  // (Status Summary, Matters, Matter Contacts, Parties & Billing, Field Map).
  const ORDER = ["Status Summary", "Matters", "Matter Contacts", "Parties & Billing", "Field Map"];
  const sheets = {};
  let sheetIndex = 0;
  for await (const ws of reader) {
    const sheetName = ORDER[sheetIndex];
    sheetIndex += 1;
    if (!["Matters", "Matter Contacts", "Parties & Billing"].includes(sheetName)) {
      for await (const _ of ws) void _; // drain
      continue;
    }
    let header = null;
    const rows = [];
    for await (const row of ws) {
      const values = row.values.slice(1);
      if (!header) {
        header = values.map((h) => str(h));
        continue;
      }
      const obj = {};
      for (let i = 0; i < header.length; i += 1) {
        if (header[i] && values[i] !== undefined && values[i] !== null) {
          const v = cellValue(values[i]);
          if (v !== null && v !== "" && !(typeof v === "string" && v.trim() === "")) {
            obj[header[i]] = v;
          }
        }
      }
      rows.push(obj);
    }
    sheets[sheetName] = { header: header || [], rows };
  }
  return sheets;
};

// ---------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------
const mapCaseType = (row) => {
  const raw =
    str(row["Case Type"]) ||
    str(row["Opportunity Type"]) ||
    str(row["Matter Type (Record Type)"]);
  const t = lc(raw);
  if (t.includes("mediat")) return { caseType: "MEDIATION", label: null };
  if (t.includes("arbitrat"))
    return { caseType: "ARBITRATION", label: null };
  return { caseType: "CUSTOM_ADR", label: raw || "Other" };
};

const SCHEDULED_STAGES = new Set([
  "Hearing Scheduled",
  "Zoom Session",
  "Conference call arranged",
  "Additional Hearing",
]);

const mapLifecycle = (matterStatus, stage) => {
  if (matterStatus === "Closed" || matterStatus === "Cancelled") return "CLOSED";
  if (stage === "On Hold") return "ON_HOLD";
  if (SCHEDULED_STAGES.has(stage)) return "SCHEDULED";
  return "ACTIVE";
};

const mapConflict = (v) => {
  const t = lc(v);
  if (!t) return "PENDING";
  if (t.includes("no conflict")) return "CLEARED";
  if (t.includes("conflicted")) return "FLAGGED";
  return "PENDING";
};

const mapFeeSchedule = (v) => {
  const t = lc(v);
  if (!t) return null;
  if (/(receiv|agree|confirm|sign|accept|approved)/.test(t)) return "CONFIRMED";
  return "PENDING";
};

const mapRevenueStatus = (v) => {
  const t = lc(v);
  if (t === "total submitted") return "RECEIVED";
  if (t === "waiting payment") return "INVOICED";
  return "ESTIMATED";
};

const mapHearingStatus = ({ status, matterStatus, hearingDate }) => {
  const t = lc(status);
  if (matterStatus === "Cancelled") return "CANCELLED";
  if (t === "completed" || t.startsWith("continued")) return "COMPLETED";
  if (t === "scheduled") return "CONFIRMED";
  if (t.includes("holding")) return "HOLD_REQUESTED";
  if (matterStatus === "Closed" && hearingDate && hearingDate < new Date())
    return "COMPLETED";
  return "PENDING";
};

const mapConferenceStatus = (v, matterStatus) => {
  const t = lc(v);
  if (t.includes("complete")) return "COMPLETED";
  if (t.includes("cancel") || matterStatus === "Cancelled") return "CANCELLED";
  if (matterStatus === "Closed") return "COMPLETED";
  return "SCHEDULED";
};

const ORG_PATTERN =
  /\b(inc|llc|l\.l\.c|corp|corporation|company|co|ltd|llp|lp|plc|bank|group|association|university|united states|state of|dept|department|holdings|partners|trust|services|insurance|county|city of|authority|foundation|fund|systems|technologies|international)\b|[&0-9,]/i;

const isOrganization = (name) => ORG_PATTERN.test(name || "") || /\bet al\b/i.test(name || "");

const nameKey = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Parses the Plaintiff Counsel / Defendant Counsel HTML columns, e.g.
 *   <b>TracBeam:</b><br><u>Dovel & Luner</u><br>Jeff Eichmann<br><br><b>TCS:</b>...
 * into [{ name, firm, lawyers: [{ name, firm }] }].
 */
const parseCounselHtml = (v) => {
  const s = str(v);
  if (!s || !/<b>/i.test(s)) return [];
  const out = [];
  for (const chunk of s.split(/<b>/i).slice(1)) {
    const [nameRaw, ...restParts] = chunk.split(/<\/b>/i);
    const name = decodeEntities(nameRaw.replace(/<[^>]+>/g, ""))
      .replace(/\s+/g, " ")
      .replace(/:\s*$/, "")
      .trim();
    if (!name) continue;
    let firm = null;
    let currentFirm = null;
    const lawyers = [];
    for (const piece of restParts.join("</b>").split(/<br\s*\/?>/i)) {
      const text = decodeEntities(piece.replace(/<[^>]+>/g, ""))
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      if (/<u>/i.test(piece)) {
        currentFirm = text;
        if (!firm) firm = text;
      } else {
        lawyers.push({ name: text, firm: currentFirm });
      }
    }
    out.push({ name, firm, lawyers });
  }
  return out;
};

const sideFromRole = (role) => {
  const t = lc(role);
  if (t.startsWith("plaintiff")) return "CLAIMANT";
  if (t.startsWith("defendant")) return "RESPONDENT";
  return null;
};

const sideFromRepresenting = (v) => {
  const t = lc(v);
  if (t.startsWith("plaintiff")) return "CLAIMANT";
  if (t.startsWith("defendant")) return "RESPONDENT";
  return null;
};

const isJudgeRole = (role) =>
  lc(role).startsWith("judge") && !lc(role).includes("assistant");

const isCounselRole = (role) =>
  !!sideFromRole(role) && !lc(role).includes("assistant");

// Columns folded into one structured "Salesforce import summary" note.
const SUMMARY_FIELDS = [
  "Salesforce Matter ID",
  "Case ID",
  "Stage",
  "Case Status (SF field)",
  "Matter Owner",
  "Case Manager",
  "Account / Client",
  "Mediator",
  "Requested Judge",
  "Judge(s) Requested",
  "Initial Contact",
  "Inquiry Contact Type",
  "Counsel Involved",
  "Law Firms Involved",
  "Counsel for",
  "Representing",
  "Representing Party",
  "Arbitrator Position",
  "Other Arbs. on Panel",
  "Arbitration Type",
  "Arbitration Format",
  "Award Type",
  "Hearing Type",
  "Conference Call Type",
  "Number of Days Requested",
  "Number of Hearing Days",
  "Time Frame Requested",
  "Requested Date",
  "Selected Date",
  "Requested Location",
  "Hearing Status",
  "Hearing Judge Availability",
  "Hearing Attendees Status",
  "Date Confirmed",
  "Location Confirmed",
  "Settlement status",
  "Agreement",
  "Agreement Status",
  "Agreement Due",
  "Plaintiff Agreement Status",
  "Defendant Agreement Status",
  "Confirmation of Assignment",
  "Case Info",
  "Service List",
  "Conflict Check Status",
  "Document Submission Status",
  "Document Submission Date",
  "Parties Exchanging Documents",
  "Parties Submitting Confidential Judge On",
  "Disclosure Form Sent to Judge",
  "Disclosure Form Received",
  "Disclosure Form Sent to Counsel",
  "Fee Split",
  "Number Of Parties Invoiced",
  "Amount",
  "Judge hourly fee",
  "Est. Set-up fee",
  "Act. Set-up fee",
  "Setup Fee",
  "Est. Admin fee",
  "Act. Admin fee",
  "Administration Fee(%)",
  "Addendum A Percent",
  "Addendum A Fee",
  "Filing Fee",
  "Admin Fee",
  "Backoffice Fee",
  "Management Fee",
  "Deposit Status",
  "Additional Deposit Status",
  "Deposit Due",
  "Total Deposit",
  "Deposit Remaining",
  "Total Plaintiff Deposit",
  "Amount Deposited By Plaintiff",
  "Amount Due",
  "Amount Due Plaintiff",
  "Amount Due Defendant",
  "Plaintiff Payment Status",
  "Defendant Payment Status",
  "Plaintiff Payment Counsel",
  "Defendant Payment Counsel",
  "Plaintiff Refunded",
  "Defendant Refunded",
  "Refund Status",
  "Refund",
  "Payment to Judge",
  "Judge Expenses",
  "Case Expenses",
  "Total Revenue",
  "Invoice (Copy accounting)",
  "Revenue Status",
  "Est. Yearly Revenue",
  "Potential",
  "Mediation File Name",
  "Hearing Court Reporter Services",
  "Rules",
  "Located",
  "Fee Schedule",
  "Check About Holding Dates On",
  "Last Activity",
  "Last Stage Change Date",
];

const DATE_SUMMARY_FIELDS = new Set([
  "Requested Date",
  "Selected Date",
  "Agreement Due",
  "Deposit Due",
  "Document Submission Date",
  "Disclosure Form Sent to Judge",
  "Disclosure Form Received",
  "Disclosure Form Sent to Counsel",
  "Check About Holding Dates On",
  "Last Activity",
  "Last Stage Change Date",
]);

const NOTE_FIELDS = [
  ["Comments", "Comments [Comments__c]"],
  ["Previous Steps", "Previous Steps"],
  ["Special Instructions - Agreement", "Special Instructions - Agreement"],
  ["Special Instructions - Deposits", "Special Instructions - Deposits"],
  ["Special Instructions", "Special Instructions"],
  ["Deposit tracking", "Deposit tracking"],
  ["Judge's Invoices", "Judge's Invoices"],
  ["Other comments", "Other comments"],
  ["Plaintiff Comments", "Plaintiff Comments"],
  ["Defendant Comments", "Defendant Comments"],
  ["Joint Documents", "Joint Documents"],
  ["Plaintiffs Documents", "Plaintiffs Documents"],
  ["Defendants Documents", "Defendants Documents"],
  ["Schedule", "Schedule"],
  ["Document Submission Instructions", "Document Submission Instructions"],
  ["Hearing Court Reporter Services", "Hearing Court Reporter Services"],
  ["Case History", "Case History"],
  ["Conference Call-in Info", "Conference Call-in Info"],
  ["Referred by", "Referred by"],
  ["Business notes", "Comments [Comments_Biz_Dev__c]"],
];

// ---------------------------------------------------------------------------
// Pure mapping: one matter row -> plan (no DB access)
// ---------------------------------------------------------------------------
const buildPlan = (row, contacts, parties) => {
  const warnings = [];
  const sfId = str(row["Salesforce Matter ID"]);
  const matterStatus = str(row["Matter Status"]);
  const stage = str(row["Stage"]);
  const { caseType, label } = mapCaseType(row);
  const lifecycleStatus = mapLifecycle(matterStatus, stage);
  const createdAt = dateFrom(row["Created Date"]) || new Date();
  const updatedAt = dateFrom(row["Last Modified Date"]) || createdAt;
  const closeDate = dateFrom(row["Close Date"]);
  const cancelReason = str(row["Cancel Reason"]);

  if (!str(row["Case Type"]) && !str(row["Opportunity Type"]))
    warnings.push("No case type in export; mapped from record type or defaulted");

  const title = str(row["Matter Name"]) || str(row["Case Name"]) || sfId;
  const summary =
    [stripHtml(row["Full Case Name"]), stripHtml(row["Case Information"])]
      .filter(Boolean)
      .join("\n\n") || null;

  const closureSummary =
    lifecycleStatus === "CLOSED"
      ? [
          matterStatus === "Cancelled" ? "Cancelled" : "Closed",
          cancelReason ? `(${cancelReason})` : null,
          stage ? `- Salesforce stage: ${stage}` : null,
        ]
          .filter(Boolean)
          .join(" ")
      : null;

  const caseData = {
    title,
    summary,
    caseType,
    caseTypeLabel: label,
    lifecycleStatus,
    isDraft: false,
    caseValue: money(row["Case Value"]),
    feeScheduleStatus: mapFeeSchedule(str(row["Fee Schedule"])),
    conflictCheckStatus: mapConflict(str(row["Conflict Check Status"])),
    isInternational: lc(str(row["International Case"])) === "yes",
    lastContactDate: dateFrom(row["Last contact date"]),
    followUpDate: dateFrom(row["Follow-up Date"]),
    nextStep:
      str(row["Next Step [Next_Step__c]"]) || str(row["Next Step [NextStep]"]),
    jurisdiction:
      str(row["Venue [Venue__c]"]) ||
      str(row["Venue [VenueHearing__c]"]) ||
      str(row["Location"]),
    referralSource: str(row["Source of Inquiry"]) || str(row["Referred by"]),
    closedAt: lifecycleStatus === "CLOSED" ? closeDate || updatedAt : null,
    closureSummary,
    legacyCaseNumber: str(row["Case ID"]),
    legacyReferenceId: sfId,
    isMigrated: true,
    createdAt,
    updatedAt,
  };

  const stageName = stage;
  const disputeName =
    str(row["Dispute Type"]) && str(row["Dispute Type"]) !== "Unknown"
      ? str(row["Dispute Type"])
      : null;

  // Revenue milestones
  const milestones = [];
  const rev1 = money(row["Estimated Revenue"]);
  if (rev1 && rev1 > 0)
    milestones.push({
      sequence: 1,
      estimatedAmount: rev1,
      revenueDate: dateFrom(row["Revenue Date"]),
      status: mapRevenueStatus(str(row["Revenue Status"])),
    });
  const rev2 = money(row["Estimated Revenue 2"]);
  if (rev2 && rev2 > 0)
    milestones.push({
      sequence: milestones.length + 1,
      estimatedAmount: rev2,
      revenueDate: dateFrom(row["Revenue 2 date"]),
      status: "ESTIMATED",
    });

  // Hearing
  let hearing = null;
  const hearingDate = dateFrom(row["Hearing Date"]);
  if (hearingDate) {
    const location = stripHtml(row["Hearing Location"]) || str(row["Location"]);
    const virtual = /zoom|virtual|video|teleconf/i.test(
      `${str(row["Hearing Type"]) || ""} ${location || ""} ${str(row["Hearing Location"]) || ""}`,
    );
    const startText = str(row["Hearing Start Time"]);
    const startTime = withTime(hearingDate, startText);
    hearing = {
      hearingReference: `HRG-${crypto.randomUUID().toUpperCase()}`,
      type:
        caseType === "MEDIATION"
          ? "MEDIATION_SESSION"
          : caseType === "ARBITRATION"
            ? "ARBITRATION_HEARING"
            : "CUSTOM",
      title: `${title} - Hearing`,
      format: virtual ? "VIRTUAL" : "IN_PERSON",
      holdingDate: dateFrom(row["Holding Date"]),
      dateConfirmed: /all confirmed/i.test(str(row["Date Confirmed"]) || "")
        ? hearingDate
        : null,
      hearingDate,
      startTime,
      location,
      hearingStatus: mapHearingStatus({
        status: str(row["Hearing Status"]),
        matterStatus,
        hearingDate,
      }),
      createdAt,
    };
    if (startText && !startTime)
      warnings.push(`Unparsed hearing start time "${startText}"`);
  }

  // Conference call
  let conferenceCall = null;
  const confDate = dateFrom(row["Conference Call Date"]);
  if (confDate) {
    conferenceCall = {
      status: mapConferenceStatus(str(row["Conference Call Status"]), matterStatus),
      date: confDate,
      time: str(row["Conference Call Time"]),
      notes:
        [
          stripHtml(row["Conference Call Attendees"]) &&
            `Attendees:\n${stripHtml(row["Conference Call Attendees"])}`,
          stripHtml(row["Conference Call Judge Availability"]) &&
            `Judge availability:\n${stripHtml(row["Conference Call Judge Availability"])}`,
        ]
          .filter(Boolean)
          .join("\n\n") || null,
    };
  }

  // Notes
  const notes = [];
  const summaryLines = [];
  for (const h of SUMMARY_FIELDS) {
    let v = row[h];
    if (v === undefined) continue;
    v = DATE_SUMMARY_FIELDS.has(h) && dateFrom(v)
      ? dateFrom(v).toISOString().slice(0, 10)
      : stripHtml(v);
    if (v) summaryLines.push(`${h}: ${v}`);
  }
  notes.push({
    noteType: "CASE_UPDATE",
    body: `Imported from Salesforce\n${summaryLines.join("\n")}`,
  });
  for (const [noteLabel, header] of NOTE_FIELDS) {
    const v = stripHtml(row[header]);
    if (!v || v === PLACEHOLDER_SPECIAL) continue;
    notes.push({ noteType: "INTERNAL_NOTE", body: `${noteLabel}\n\n${v}` });
  }

  // Contacts
  const attorneys = []; // {key, side, role, designationHint, ...}
  const otherContacts = [];
  const judges = [];
  const sideHint = sideFromRepresenting(str(row["Counsel for"]));
  void sideHint;

  for (const c of contacts) {
    const role = str(c["Role"]) || "(none)";
    const email = lc(str(c["Email"]));
    const fullName =
      str(c["Contact Name"]) ||
      [str(c["First Name"]), str(c["Last Name"])].filter(Boolean).join(" ");
    const base = {
      sfContactId: str(c["Salesforce Contact ID"]),
      role,
      isPrimary: lc(str(c["Primary"])) === "yes",
      firstName: str(c["First Name"]),
      lastName: str(c["Last Name"]),
      fullName,
      title: str(c["Title"]),
      firm: str(c["Firm / Account"]),
      email: email || null,
      phone: str(c["Phone"]),
      mobile: str(c["Mobile"]),
      street: str(c["Street"]),
      city: str(c["City"]),
      state: str(c["State"]),
      zip: str(c["Zip"]),
    };
    if (!fullName && !email) continue;

    if (isCounselRole(role)) {
      attorneys.push({ ...base, side: sideFromRole(role) });
    } else if (isJudgeRole(role)) {
      judges.push(base);
    } else {
      otherContacts.push(base);
    }
  }

  // Parties
  const partyPlans = parties.map((p) => {
    const name = str(p["Party (Account)"]) || "Unknown party";
    const side = sideFromRepresenting(str(p["Representing"]));
    return {
      recordNo: str(p["Party Record #"]),
      name,
      side,
      lawyerName: str(p["Lawyer"]),
      lawyerEmail: lc(str(p["Lawyer Email"])) || null,
      firmName: str(p["Firm Name"]),
      finance: {
        distribution: num(p["Distribution %"]),
        fee: money(p["Fee Amount"]),
        paid: money(p["Total Paid"]),
        balance: money(p["Balance Due"]),
        refund: money(p["Refund Amount"]),
      },
      representing: str(p["Representing"]),
    };
  });

  if (partyPlans.length > 2) caseData.disputePartyStructure = "MULTI_PARTY";

  // Billing configuration (fee schedule only; the export has no invoices/timesheets)
  const pct = (v) => {
    const n = num(v);
    return n !== null && n >= 0 && n <= 100 ? n : null;
  };
  const hourly = money(row["Judge hourly fee"]);
  const setupFee =
    money(row["Act. Set-up fee"]) ??
    money(row["Est. Set-up fee"]) ??
    money(row["Setup Fee"]);
  const adminFee = money(row["Act. Admin fee"]) ?? money(row["Est. Admin fee"]);
  const adminPct = pct(row["Administration Fee(%)"]);
  const agreementPct = pct(row["Addendum A Percent"]);
  const feeSplitText = str(row["Fee Split"]);
  const hasDepositData =
    num(row["Total Deposit"]) !== null || !!str(row["Deposit Status"]);

  let billing = null;
  if (hourly || setupFee || adminFee || adminPct || agreementPct) {
    billing = {
      billingType: hourly ? "HOURLY" : "FLAT",
      billingMode: hasDepositData ? "DEPOSIT_BASED" : "STANDARD",
      neutralHourlyRate: hourly,
      setupFee,
      administrationFee: adminFee,
      adminFeePercentage: adminPct,
      agreementFeePercentage: agreementPct,
      fedArbFeeScheduleType:
        caseType === "MEDIATION" || caseType === "ARBITRATION" ? caseType : null,
      billingNotes: feeSplitText ? `Fee split (Salesforce): ${feeSplitText}` : null,
    };
  }

  const htmlParties = {
    CLAIMANT: parseCounselHtml(row["Plaintiff Counsel"]),
    RESPONDENT: parseCounselHtml(row["Defendant Counsel"]),
  };

  return {
    htmlParties,
    billing,
    sfId,
    title,
    matterStatus,
    caseData,
    stageName,
    disputeName,
    milestones,
    hearing,
    conferenceCall,
    notes,
    attorneys,
    judges,
    otherContacts,
    partyPlans,
    warnings,
  };
};

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------
const CASE_PREFIXES = {
  MEDIATION: "MED",
  ARBITRATION: "ARB",
  HYBRID_ADR: "HYB",
  CUSTOM_ADR: "ADR",
};

const caseCounters = new Map();
const nextCaseNumber = async (caseType, year) => {
  const prefix = CASE_PREFIXES[caseType];
  const key = `${prefix}-${year}`;
  if (!caseCounters.has(key)) {
    const last = await prisma.case.findFirst({
      where: { caseNumber: { startsWith: `${key}-` } },
      orderBy: { caseNumber: "desc" },
      select: { caseNumber: true },
    });
    const n = last ? Number(last.caseNumber.split("-").pop()) : 0;
    caseCounters.set(key, Number.isNaN(n) ? 0 : n);
  }
  const next = caseCounters.get(key) + 1;
  caseCounters.set(key, next);
  return `${key}-${String(next).padStart(4, "0")}`;
};

const caches = {
  stage: new Map(),
  dispute: new Map(),
  firm: new Map(),
  attorney: new Map(), // legacy/email key -> id
  contact: new Map(), // SF:<id>|role -> id
};

const getStageId = async (name) => {
  if (!name) return null;
  if (!caches.stage.has(name)) {
    const s = await prisma.caseStage.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: caches.stage.size },
    });
    caches.stage.set(name, s.id);
  }
  return caches.stage.get(name);
};

const getDisputeId = async (name) => {
  if (!name) return null;
  if (!caches.dispute.has(name)) {
    const d = await prisma.disputeCategory.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: caches.dispute.size },
    });
    caches.dispute.set(name, d.id);
  }
  return caches.dispute.get(name);
};

const JUDGE_FIRM = /^judge\b/i;

const getFirmId = async (name, c) => {
  if (!name || JUDGE_FIRM.test(name)) return null;
  if (!caches.firm.has(name)) {
    const address =
      [c?.street, c?.city, c?.state, c?.zip].filter(Boolean).join(", ") || null;
    const f = await prisma.lawFirm.upsert({
      where: { name },
      update: {},
      create: { name, address, phone: c?.phone || null },
    });
    caches.firm.set(name, f.id);
  }
  return caches.firm.get(name);
};

const attorneyKey = (a) =>
  a.sfContactId
    ? `sf:${a.sfContactId}`
    : a.email
      ? `em:${a.email}`
      : `nm:${lc(a.fullName)}|${lc(a.firm)}`;

const getAttorneyId = async (a, batchId) => {
  const key = attorneyKey(a);
  if (caches.attorney.has(key)) return caches.attorney.get(key);

  const names =
    a.firstName || a.lastName
      ? { firstName: a.firstName || "Unknown", lastName: a.lastName || "-" }
      : splitName(a.fullName);
  const lawFirmId = await getFirmId(a.firm, a);
  const created = await prisma.attorney.create({
    data: {
      ...names,
      email: a.email,
      phone: a.phone || a.mobile || null,
      lawFirmId,
      legacyReferenceId: key,
      isMigrated: true,
      migrationBatchId: batchId,
    },
  });
  caches.attorney.set(key, created.id);
  return created.id;
};

const getContactId = async (c, ownerUserId, matterTitle) => {
  const key = `${c.sfContactId || c.email || lc(c.fullName)}|${c.role}`;
  if (caches.contact.has(key)) return caches.contact.get(key);
  const created = await prisma.contact.create({
    data: {
      name: c.fullName || c.email,
      firstName: c.firstName,
      lastName: c.lastName,
      company: c.firm,
      email: c.email,
      phone: c.phone || c.mobile || null,
      state: c.state,
      role: c.role,
      notes: `SF:${c.sfContactId || "-"} | first seen on matter: ${matterTitle}`,
      ownerUserId,
    },
  });
  caches.contact.set(key, created.id);
  return created.id;
};

// Resolve lawyers named in the counsel HTML to Attorney ids (outside any tx).
// knownAttorneys: Map(nameKey -> attorneyId) of attorneys already known on this case.
const resolveHtmlLawyers = async (parsed, knownAttorneys, batchId) => {
  const out = [];
  for (const p of parsed) {
    const ids = [];
    for (const l of p.lawyers) {
      const key = nameKey(l.name);
      let id = knownAttorneys.get(key);
      if (!id) {
        id = await getAttorneyId(
          {
            sfContactId: null,
            email: null,
            fullName: l.name,
            firstName: null,
            lastName: null,
            firm: l.firm || p.firm,
            phone: null,
          },
          batchId,
        );
        knownAttorneys.set(key, id);
      }
      if (!ids.includes(id)) ids.push(id);
    }
    out.push({ ...p, attorneyIds: ids });
  }
  return out;
};

// Creates named parties (always ORGANIZATION so the exported name is kept verbatim)
// with their lawyers. Returns { partyIds, attorneyIds }.
const createHtmlParties = async (tx, { caseId, sfId, side, parties, batchId }) => {
  const partyIds = [];
  const attached = new Set();
  for (let i = 0; i < parties.length; i += 1) {
    const p = parties[i];
    const party = await tx.caseParty.create({
      data: {
        caseId,
        partyType: "ORGANIZATION",
        side,
        organizationName: p.name,
        notes: p.firm
          ? `Imported from Salesforce counsel text. Counsel firm: ${p.firm}`
          : "Imported from Salesforce counsel text.",
        legacyReferenceId: `${sfId}:html:${side}:${i}`,
        isMigrated: true,
        migrationBatchId: batchId,
      },
    });
    partyIds.push(party.id);
    for (let j = 0; j < p.attorneyIds.length; j += 1) {
      await tx.partyAttorneyRepresentation.upsert({
        where: {
          casePartyId_attorneyId: { casePartyId: party.id, attorneyId: p.attorneyIds[j] },
        },
        update: {},
        create: {
          casePartyId: party.id,
          attorneyId: p.attorneyIds[j],
          designation: j === 0 ? "LEAD_COUNSEL" : "CO_COUNSEL",
        },
      });
      attached.add(p.attorneyIds[j]);
    }
  }
  return { partyIds, attached };
};

// partyDistributions: [{ id, distribution }] for the case's parties
const createBillingConfig = async (tx, caseId, billing, partyDistributions, warnings) => {
  const splits = partyDistributions
    .filter((p) => p.distribution !== null && p.distribution > 0)
    .map((p) => ({
      id: p.id,
      pct:
        Math.round((p.distribution <= 1 ? p.distribution * 100 : p.distribution) * 100) / 100,
    }));
  const total = splits.reduce((s, x) => s + x.pct, 0);
  const splitsValid = splits.length >= 2 && Math.abs(total - 100) <= 0.5;
  if (splits.length && !splitsValid)
    warnings.push(`Distribution % sums to ${total}; payer splits not created`);

  const config = await tx.billingConfiguration.create({
    data: { caseId, ...billing, splitBillingEnabled: splitsValid },
  });
  if (splitsValid)
    await tx.billingPayerSplit.createMany({
      data: splits.map((s) => ({
        billingConfigurationId: config.id,
        casePartyId: s.id,
        splitPercentage: s.pct,
      })),
    });
};

// ---------------------------------------------------------------------------
// Backfill: add missing BillingConfiguration to already-imported cases
// ---------------------------------------------------------------------------
const backfillBilling = async (matters, contactsByMatter, partiesByMatter) => {
  const existing = await prisma.case.findMany({
    where: {
      isMigrated: true,
      legacyReferenceId: { not: null },
      billingConfiguration: null,
    },
    select: {
      id: true,
      legacyReferenceId: true,
      parties: { select: { id: true, legacyReferenceId: true } },
    },
  });
  const byLegacy = new Map(existing.map((c) => [c.legacyReferenceId, c]));
  console.log(`Imported cases without billing config: ${byLegacy.size}`);

  let created = 0;
  let noFeeData = 0;
  let failed = 0;
  for (const row of matters) {
    const sfId = str(row["Salesforce Matter ID"]);
    const c = byLegacy.get(sfId);
    if (!c) continue;
    const plan = buildPlan(row, contactsByMatter.get(sfId) || [], partiesByMatter.get(sfId) || []);
    if (!plan.billing) {
      noFeeData += 1;
      continue;
    }
    const distByLegacy = new Map(
      plan.partyPlans.map((p) => [`${sfId}:${p.recordNo || p.name}`, p.finance.distribution]),
    );
    const partyDistributions = c.parties.map((p) => ({
      id: p.id,
      distribution: distByLegacy.get(p.legacyReferenceId) ?? null,
    }));
    try {
      await prisma.$transaction((tx) =>
        createBillingConfig(tx, c.id, plan.billing, partyDistributions, []),
      );
      created += 1;
    } catch (err) {
      failed += 1;
      console.error(`Backfill failed for ${sfId}: ${err.message}`);
    }
  }
  console.log({ billingConfigsCreated: created, casesWithNoFeeData: noFeeData, failed });
};

// ---------------------------------------------------------------------------
// Backfill: named parties from counsel HTML on already-imported cases.
// Only touches sides that have no real party (none, or only the placeholder).
// Representations on a placeholder are moved to the new parties, then the
// placeholder is deleted.
// ---------------------------------------------------------------------------
const backfillParties = async (matters, contactsByMatter, partiesByMatter) => {
  const cases = await prisma.case.findMany({
    where: { isMigrated: true, legacyReferenceId: { not: null } },
    select: {
      id: true,
      legacyReferenceId: true,
      migrationBatchId: true,
      parties: {
        select: {
          id: true,
          side: true,
          legacyReferenceId: true,
          representations: {
            select: {
              attorneyId: true,
              designation: true,
              attorney: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });
  const byLegacy = new Map(cases.map((c) => [c.legacyReferenceId, c]));

  let partiesCreated = 0;
  let casesTouched = 0;
  let placeholdersRemoved = 0;
  let failed = 0;

  for (const row of matters) {
    const sfId = str(row["Salesforce Matter ID"]);
    const c = byLegacy.get(sfId);
    if (!c) continue;
    const plan = buildPlan(row, contactsByMatter.get(sfId) || [], partiesByMatter.get(sfId) || []);

    const todo = [];
    for (const side of ["CLAIMANT", "RESPONDENT"]) {
      if (!plan.htmlParties[side].length) continue;
      const real = c.parties.filter(
        (p) => p.side === side && !/:placeholder:/.test(p.legacyReferenceId || ""),
      );
      if (real.length) continue; // explicit party rows or already backfilled
      todo.push(side);
    }
    if (!todo.length) continue;

    try {
      const known = new Map();
      for (const p of c.parties)
        for (const r of p.representations)
          known.set(nameKey(`${r.attorney.firstName} ${r.attorney.lastName}`), r.attorneyId);

      const resolved = {};
      for (const side of todo)
        resolved[side] = await resolveHtmlLawyers(
          plan.htmlParties[side],
          known,
          c.migrationBatchId,
        );

      await prisma.$transaction(
        async (tx) => {
          for (const side of todo) {
            const res = await createHtmlParties(tx, {
              caseId: c.id,
              sfId,
              side,
              parties: resolved[side],
              batchId: c.migrationBatchId,
            });
            partiesCreated += res.partyIds.length;

            const placeholder = c.parties.find(
              (p) => p.side === side && /:placeholder:/.test(p.legacyReferenceId || ""),
            );
            if (placeholder) {
              for (const r of placeholder.representations) {
                if (res.attached.has(r.attorneyId)) continue;
                await tx.partyAttorneyRepresentation.upsert({
                  where: {
                    casePartyId_attorneyId: {
                      casePartyId: res.partyIds[0],
                      attorneyId: r.attorneyId,
                    },
                  },
                  update: {},
                  create: {
                    casePartyId: res.partyIds[0],
                    attorneyId: r.attorneyId,
                    designation: "CO_COUNSEL",
                  },
                });
              }
              await tx.caseParty.delete({ where: { id: placeholder.id } });
              placeholdersRemoved += 1;
            }
          }
        },
        { timeout: 60000, maxWait: 30000 },
      );
      casesTouched += 1;
    } catch (err) {
      failed += 1;
      console.error(`Party backfill failed for ${sfId}: ${err.message}`);
    }
  }
  console.log({ casesTouched, partiesCreated, placeholdersRemoved, failed });
};

// ---------------------------------------------------------------------------
// Persist one plan
// ---------------------------------------------------------------------------
const persistPlan = async (plan, ctx) => {
  const { caseManager, batchId, neutralsByEmail } = ctx;
  const warnings = [...plan.warnings];

  const [stageId, disputeCategoryId] = await Promise.all([
    getStageId(plan.stageName),
    getDisputeId(plan.disputeName),
  ]);

  // Global (cross-matter) entities, created outside the case transaction.
  const attorneyIds = [];
  for (const a of plan.attorneys) {
    attorneyIds.push({ ...a, attorneyId: await getAttorneyId(a, batchId) });
  }

  // Named parties from the counsel HTML, only for sides with no Parties & Billing row.
  const knownAttorneys = new Map(
    attorneyIds.filter((a) => a.fullName).map((a) => [nameKey(a.fullName), a.attorneyId]),
  );
  const explicitSides = new Set(
    plan.partyPlans.map((p) => p.side).filter(Boolean),
  );
  const htmlResolved = {};
  for (const side of ["CLAIMANT", "RESPONDENT"]) {
    if (!explicitSides.has(side) && plan.htmlParties[side].length)
      htmlResolved[side] = await resolveHtmlLawyers(plan.htmlParties[side], knownAttorneys, batchId);
  }

  for (const c of plan.otherContacts) {
    await getContactId(c, caseManager.id, plan.title);
  }

  // Judges: link to existing neutral users by email, else keep as Contact.
  const neutralLinks = [];
  const unlinkedJudges = [];
  for (const j of plan.judges) {
    const user = j.email ? neutralsByEmail.get(j.email) : null;
    if (user) {
      if (!neutralLinks.some((n) => n.userId === user.id))
        neutralLinks.push({ userId: user.id, isPrimary: j.isPrimary });
    } else {
      unlinkedJudges.push(j);
      await getContactId(j, caseManager.id, plan.title);
    }
  }
  if (unlinkedJudges.length)
    warnings.push(
      `${unlinkedJudges.length} judge(s) not matched to a neutral user: ${unlinkedJudges
        .map((j) => j.fullName || j.email)
        .join("; ")}`,
    );

  const year = plan.caseData.createdAt.getUTCFullYear();

  return prisma.$transaction(
    async (tx) => {
      // nextCaseNumber uses prisma (not tx); numbers are monotonic in-process.
      const caseNumber = await nextCaseNumber(plan.caseData.caseType, year);

      const created = await tx.case.create({
        data: {
          ...plan.caseData,
          caseNumber,
          stageId,
          disputeCategoryId,
          migrationBatchId: batchId,
        },
      });

      await tx.caseParticipant.create({
        data: {
          userId: caseManager.id,
          caseId: created.id,
          role: "CASE_MANAGER",
          isPrimary: true,
          assignmentType: "ASSIGNED",
          assignmentReason: "Salesforce import",
        },
      });

      for (const n of neutralLinks) {
        await tx.caseParticipant.create({
          data: {
            userId: n.userId,
            caseId: created.id,
            role: "NEUTRAL",
            isPrimary: n.isPrimary,
            assignmentType: "ASSIGNED",
            assignmentReason: "Salesforce import",
          },
        });
      }

      if (plan.milestones.length)
        await tx.caseRevenueMilestone.createMany({
          data: plan.milestones.map((m) => ({ ...m, caseId: created.id })),
        });

      if (plan.hearing)
        await tx.hearing.create({
          data: { ...plan.hearing, caseId: created.id },
        });

      if (plan.conferenceCall)
        await tx.caseConferenceCall.create({
          data: { ...plan.conferenceCall, caseId: created.id },
        });

      // Parties: explicit rows first, then placeholders for counsel-only sides.
      const partyBySide = { CLAIMANT: [], RESPONDENT: [] };
      const partyByEmail = new Map();
      const createdParties = [];
      const partyIdsInOrder = [];

      const lawyerSideByEmail = new Map(
        attorneyIds.filter((a) => a.email).map((a) => [a.email, a.side]),
      );

      for (const p of plan.partyPlans) {
        let side = p.side || (p.lawyerEmail && lawyerSideByEmail.get(p.lawyerEmail));
        if (!side) {
          side = "CLAIMANT";
          warnings.push(
            `Party "${p.name}" has side "${p.representing || "blank"}"; defaulted to CLAIMANT`,
          );
        }
        const org = isOrganization(p.name);
        const names = org ? {} : splitName(p.name);
        const f = p.finance;
        const financeNote = [
          `Salesforce party record ${p.recordNo || "-"} (${p.representing || "no side"})`,
          f.distribution !== null && `Distribution: ${f.distribution}`,
          f.fee !== null && `Fee amount: ${f.fee}`,
          f.paid !== null && `Total paid: ${f.paid}`,
          f.balance !== null && `Balance due: ${f.balance}`,
          f.refund !== null && `Refund: ${f.refund}`,
        ]
          .filter(Boolean)
          .join("\n");
        const party = await tx.caseParty.create({
          data: {
            caseId: created.id,
            partyType: org ? "ORGANIZATION" : "INDIVIDUAL",
            side,
            firstName: org ? null : names.firstName,
            lastName: org ? null : names.lastName,
            organizationName: org ? p.name : null,
            notes: financeNote,
            legacyReferenceId: `${plan.sfId}:${p.recordNo || p.name}`,
            isMigrated: true,
            migrationBatchId: batchId,
          },
        });
        partyBySide[side].push(party.id);
        createdParties.push(party);
        partyIdsInOrder.push({ id: party.id, distribution: p.finance.distribution });
        if (p.lawyerEmail) partyByEmail.set(p.lawyerEmail, party.id);

        if (p.lawyerName || p.lawyerEmail) {
          const attorneyId = await getAttorneyId(
            {
              sfContactId: null,
              email: p.lawyerEmail,
              fullName: p.lawyerName,
              firstName: null,
              lastName: null,
              firm: p.firmName,
              phone: null,
            },
            batchId,
          );
          await tx.partyAttorneyRepresentation.upsert({
            where: {
              casePartyId_attorneyId: { casePartyId: party.id, attorneyId },
            },
            update: {},
            create: {
              casePartyId: party.id,
              attorneyId,
              designation: "LEAD_COUNSEL",
            },
          });
        }
      }

      // Billing configuration + payer splits (from Distribution %)
      if (plan.billing)
        await createBillingConfig(tx, created.id, plan.billing, partyIdsInOrder, warnings);

      // Named parties parsed from the counsel HTML (sides with no explicit party row).
      const attachedAttorneys = new Set();
      for (const side of ["CLAIMANT", "RESPONDENT"]) {
        if (partyBySide[side].length === 0 && htmlResolved[side]) {
          const res = await createHtmlParties(tx, {
            caseId: created.id,
            sfId: plan.sfId,
            side,
            parties: htmlResolved[side],
            batchId,
          });
          partyBySide[side].push(...res.partyIds);
          createdParties.push(...res.partyIds.map((id) => ({ id })));
          for (const id of res.attached) attachedAttorneys.add(id);
        }
      }

      // Counsel from Matter Contacts: attach to a party on their side.
      const leadSeen = new Set();
      for (const a of attorneyIds) {
        if (!a.side) continue;
        if (attachedAttorneys.has(a.attorneyId)) continue;
        let partyId = a.email && partyByEmail.get(a.email);
        if (!partyId) partyId = partyBySide[a.side][0];
        if (!partyId) {
          const label = a.side === "CLAIMANT" ? "Plaintiff side" : "Defendant side";
          const placeholder = await tx.caseParty.create({
            data: {
              caseId: created.id,
              partyType: "ORGANIZATION",
              side: a.side,
              organizationName: label,
              notes:
                "Placeholder created from Salesforce counsel contacts; party names were not in the export.",
              legacyReferenceId: `${plan.sfId}:placeholder:${a.side}`,
              isMigrated: true,
              migrationBatchId: batchId,
            },
          });
          partyBySide[a.side].push(placeholder.id);
          partyId = placeholder.id;
          warnings.push(`Placeholder ${label} party created for counsel`);
        }
        const hasLead = leadSeen.has(partyId);
        const isLead = /lead/i.test(a.role) || a.isPrimary || !hasLead;
        const designation = isLead && !hasLead ? "LEAD_COUNSEL" : "CO_COUNSEL";
        if (designation === "LEAD_COUNSEL") leadSeen.add(partyId);
        await tx.partyAttorneyRepresentation.upsert({
          where: {
            casePartyId_attorneyId: { casePartyId: partyId, attorneyId: a.attorneyId },
          },
          update: {},
          create: { casePartyId: partyId, attorneyId: a.attorneyId, designation },
        });
      }

      if (createdParties.length > 2 && plan.caseData.disputePartyStructure !== "MULTI_PARTY")
        await tx.case.update({
          where: { id: created.id },
          data: { disputePartyStructure: "MULTI_PARTY" },
        });

      // Notes (include unlinked judges / other contacts for visibility)
      const contactLines = (list) =>
        list
          .map(
            (c) =>
              `${c.role}: ${c.fullName || ""}${c.email ? ` <${c.email}>` : ""}${c.firm ? ` (${c.firm})` : ""}${c.phone ? ` ${c.phone}` : ""}`,
          )
          .join("\n");
      const extraNotes = [];
      if (unlinkedJudges.length)
        extraNotes.push({
          noteType: "CASE_UPDATE",
          body: `Neutrals from Salesforce (no matching user account)\n${contactLines(unlinkedJudges)}`,
        });
      const assistants = plan.otherContacts;
      if (assistants.length)
        extraNotes.push({
          noteType: "INTERNAL_NOTE",
          body: `Other Salesforce contacts\n${contactLines(assistants)}`,
        });

      await tx.caseNote.createMany({
        data: [...plan.notes, ...extraNotes].map((n) => ({
          ...n,
          caseId: created.id,
          authorUserId: caseManager.id,
          visibility: "INTERNAL_ONLY",
          createdAt: plan.caseData.createdAt,
        })),
      });

      return { caseId: created.id, caseNumber, warnings };
    },
    { timeout: 120000, maxWait: 30000 },
  );
};

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------
const rollback = async (batchId) => {
  const batch = await prisma.migrationBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error(`Migration batch ${batchId} not found`);
  const cases = await prisma.case.deleteMany({ where: { migrationBatchId: batchId } });
  const attorneys = await prisma.attorney.deleteMany({
    where: { migrationBatchId: batchId },
  });
  const contacts = await prisma.contact.deleteMany({
    where: {
      ownerUserId: batch.importedByUserId,
      notes: { startsWith: "SF:" },
      createdAt: { gte: batch.startedAt || batch.createdAt },
    },
  });
  await prisma.migrationBatch.delete({ where: { id: batchId } });
  console.log(
    `Rolled back batch ${batchId}: ${cases.count} cases, ${attorneys.count} attorneys, ${contacts.count} contacts deleted.`,
  );
  console.log(
    "Note: LawFirm, CaseStage and DisputeCategory rows created by the import are left in place.",
  );
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const groupBy = (rows, key) => {
  const m = new Map();
  for (const r of rows) {
    const k = str(r[key]);
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};

const main = async () => {
  if (ROLLBACK_BATCH) {
    await rollback(ROLLBACK_BATCH);
    return;
  }

  if (!CASE_MANAGER_EMAIL)
    throw new Error("Set SF_CASE_MANAGER_EMAIL to the owning case manager's email.");

  const caseManager = await prisma.user.findUnique({
    where: { email: CASE_MANAGER_EMAIL },
    select: {
      id: true,
      email: true,
      status: true,
      role: { select: { name: true } },
    },
  });
  if (!caseManager && DRY_RUN)
    console.warn(`Warning: user ${CASE_MANAGER_EMAIL} not found in this DB (dry run continues).`);
  else if (!caseManager) throw new Error(`User ${CASE_MANAGER_EMAIL} not found.`);
  if (caseManager && caseManager.role?.name !== "CASE_MANAGER")
    throw new Error(
      `User ${CASE_MANAGER_EMAIL} has role ${caseManager.role?.name}, expected CASE_MANAGER.`,
    );
  if (caseManager && caseManager.status !== "ACTIVE")
    console.warn(`Warning: case manager status is ${caseManager.status}.`);

  console.log(`Reading ${FILE_PATH} ...`);
  const sheets = await readWorkbook(FILE_PATH);
  const matters = sheets["Matters"]?.rows;
  const contactRows = sheets["Matter Contacts"]?.rows;
  const partyRows = sheets["Parties & Billing"]?.rows;
  if (!matters || !contactRows || !partyRows)
    throw new Error("Workbook must contain Matters, Matter Contacts and Parties & Billing sheets.");

  const contactsByMatter = groupBy(contactRows, "Salesforce Matter ID");
  const partiesByMatter = groupBy(partyRows, "Salesforce Matter ID");

  console.log(
    `Matters: ${matters.length}, contacts: ${contactRows.length}, parties: ${partyRows.length}`,
  );

  const statusCounts = {};
  const toImport = [];
  let skipped = 0;
  for (const row of matters) {
    const status = str(row["Matter Status"]);
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (SKIPPED_STATUSES.has(status)) {
      skipped += 1;
      continue;
    }
    toImport.push(row);
  }
  console.log("By status:", statusCounts);
  console.log(`To import: ${toImport.length}, skipped: ${skipped}`);

  if (BACKFILL_BILLING || BACKFILL_PARTIES) {
    if (BACKFILL_BILLING) await backfillBilling(matters, contactsByMatter, partiesByMatter);
    if (BACKFILL_PARTIES) await backfillParties(matters, contactsByMatter, partiesByMatter);
    return;
  }

  // Dry run: pure mapping only.
  if (DRY_RUN) {
    const typeCounts = {};
    const lifeCounts = {};
    const warnCounts = {};
    let hearings = 0;
    let billingConfigs = 0;
    let htmlPartyCount = 0;
    let htmlLawyerCount = 0;
    let parties = 0;
    let counsel = 0;
    let judges = 0;
    for (const row of toImport) {
      const id = str(row["Salesforce Matter ID"]);
      const plan = buildPlan(row, contactsByMatter.get(id) || [], partiesByMatter.get(id) || []);
      typeCounts[plan.caseData.caseType] = (typeCounts[plan.caseData.caseType] || 0) + 1;
      lifeCounts[plan.caseData.lifecycleStatus] = (lifeCounts[plan.caseData.lifecycleStatus] || 0) + 1;
      for (const w of plan.warnings) warnCounts[w] = (warnCounts[w] || 0) + 1;
      if (plan.hearing) hearings += 1;
      if (plan.billing) billingConfigs += 1;
      htmlPartyCount += plan.htmlParties.CLAIMANT.length + plan.htmlParties.RESPONDENT.length;
      htmlLawyerCount += [...plan.htmlParties.CLAIMANT, ...plan.htmlParties.RESPONDENT].reduce(
        (s, p) => s + p.lawyers.length,
        0,
      );
      parties += plan.partyPlans.length;
      counsel += plan.attorneys.length;
      judges += plan.judges.length;
    }
    console.log("DRY RUN - no database writes.");
    console.log({ typeCounts, lifeCounts, hearings, billingConfigs, htmlPartyCount, htmlLawyerCount, parties, counsel, judges });
    console.log("Warnings:", warnCounts);
    return;
  }

  // Idempotency + neutral lookup
  const existing = await prisma.case.findMany({
    where: { legacyReferenceId: { not: null }, isMigrated: true },
    select: { legacyReferenceId: true },
  });
  const done = new Set(existing.map((c) => c.legacyReferenceId));

  const existingAttorneys = await prisma.attorney.findMany({
    where: { isMigrated: true, legacyReferenceId: { not: null } },
    select: { id: true, legacyReferenceId: true },
  });
  for (const a of existingAttorneys) caches.attorney.set(a.legacyReferenceId, a.id);

  const existingContacts = await prisma.contact.findMany({
    where: { ownerUserId: caseManager.id, notes: { startsWith: "SF:" } },
    select: { id: true, notes: true, role: true },
  });
  for (const c of existingContacts) {
    const sf = c.notes.match(/^SF:([^ |]+)/)?.[1];
    if (sf && sf !== "-") caches.contact.set(`${sf}|${c.role}`, c.id);
  }

  const neutrals = await prisma.user.findMany({
    where: { role: { name: "NEUTRAL" } },
    select: { id: true, email: true },
  });
  const neutralsByEmail = new Map(neutrals.map((u) => [lc(u.email), u]));
  console.log(`Neutral users available for email matching: ${neutrals.length}`);

  const batch = await prisma.migrationBatch.create({
    data: {
      sourceFileName: path.basename(FILE_PATH),
      importedByUserId: caseManager.id,
      startedAt: new Date(),
      totalRecords: toImport.length,
    },
  });
  console.log(`Migration batch: ${batch.id}`);

  let success = 0;
  let warning = 0;
  let error = 0;
  let alreadyImported = 0;
  let processed = 0;

  for (const row of toImport) {
    const sfId = str(row["Salesforce Matter ID"]);
    processed += 1;
    if (done.has(sfId)) {
      alreadyImported += 1;
      continue;
    }
    try {
      const plan = buildPlan(
        row,
        contactsByMatter.get(sfId) || [],
        partiesByMatter.get(sfId) || [],
      );
      const result = await persistPlan(plan, {
        caseManager,
        batchId: batch.id,
        neutralsByEmail,
      });
      const hasWarn = result.warnings.length > 0;
      await prisma.migrationRecordLog.create({
        data: {
          migrationBatchId: batch.id,
          recordType: "Case",
          sourceRowIdentifier: sfId,
          createdRecordId: result.caseId,
          status: hasWarn ? "WARNING" : "SUCCESS",
          message: hasWarn ? result.warnings.join(" | ").slice(0, 5000) : null,
        },
      });
      if (hasWarn) warning += 1;
      else success += 1;
    } catch (err) {
      error += 1;
      await prisma.migrationRecordLog.create({
        data: {
          migrationBatchId: batch.id,
          recordType: "Case",
          sourceRowIdentifier: sfId,
          status: "ERROR",
          message: String(err.message || err).slice(0, 5000),
        },
      });
    }
    if (processed % 100 === 0)
      console.log(
        `Progress ${processed}/${toImport.length} (ok ${success}, warn ${warning}, err ${error})`,
      );
  }

  await prisma.migrationBatch.update({
    where: { id: batch.id },
    data: {
      completedAt: new Date(),
      successCount: success,
      warningCount: warning,
      errorCount: error,
    },
  });

  console.log("Done.");
  console.log({
    batchId: batch.id,
    imported: success + warning,
    success,
    warning,
    error,
    alreadyImported,
    skippedBusinessDevAndInquiry: skipped,
  });
  console.log(
    `Inspect issues: select * from migration_record_logs where "migrationBatchId"='${batch.id}' and status <> 'SUCCESS'`,
  );
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
