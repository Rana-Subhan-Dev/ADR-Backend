const fs = require("fs");
const puppeteer = require("puppeteer");
const prisma = require("../config/prisma");
const conflictsCheckRepository = require("../repositories/conflictsCheck.repository");
const ApiError = require("../utils/apiError");
const { RoleName } = require("../constants/auth.constants");
const {
  ConflictsSearchWindow,
  ConflictsCheckStatus,
  CaseLifecycleStatus,
} = require("@prisma/client");

const ALLOWED_ROLES = [
  RoleName.CASE_MANAGER,
  RoleName.ADMIN_LEADERSHIP,
  RoleName.SUPER_ADMIN,
  RoleName.ACCOUNTING_STAFF,
];

const OPEN_LIFECYCLES = new Set([
  CaseLifecycleStatus.INTAKE,
  CaseLifecycleStatus.SCHEDULED,
  CaseLifecycleStatus.ACTIVE,
  CaseLifecycleStatus.ON_HOLD,
  CaseLifecycleStatus.REOPENED,
]);

const SYSTEM_CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter(Boolean);

const assertCanAccessConflictsChecks = (currentUser) => {
  if (currentUser?.role?.name === RoleName.SUPER_ADMIN) return;
  if (!ALLOWED_ROLES.includes(currentUser?.role?.name)) {
    throw new ApiError(
      403,
      "Conflict of Interest reports are only available to case managers and staff.",
    );
  }
};

const displayName = (user) => {
  if (!user) return null;
  const name = [user.prefix, user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || user.email || null;
};

const normalizeName = (value) => {
  if (value == null) return null;
  const text = String(value).trim().toLowerCase().replace(/\s+/g, " ");
  return text || null;
};

const cleanNameList = (values = []) =>
  [...new Set((values || []).map((v) => String(v).trim()).filter(Boolean))];

const windowLabelFor = (searchWindow) =>
  searchWindow === ConflictsSearchWindow.ALL_RECORDS
    ? "All records"
    : "Last 5 years";

const fiveYearsCutoff = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 5);
  date.setHours(0, 0, 0, 0);
  return date;
};

const caseInSearchWindow = (caseRow, searchWindow, cutoff) => {
  if (searchWindow === ConflictsSearchWindow.ALL_RECORDS) return true;
  if (OPEN_LIFECYCLES.has(caseRow.lifecycleStatus)) return true;
  const closedAt = caseRow.closedAt ? new Date(caseRow.closedAt) : null;
  const updatedAt = caseRow.updatedAt ? new Date(caseRow.updatedAt) : null;
  const participationUpdated = caseRow.neutralParticipationUpdatedAt
    ? new Date(caseRow.neutralParticipationUpdatedAt)
    : null;
  const anchors = [closedAt, updatedAt, participationUpdated].filter(Boolean);
  return anchors.some((d) => d.getTime() >= cutoff.getTime());
};

const loadNeutralCases = async (neutralUserId) => {
  const cases = await prisma.case.findMany({
    where: {
      participants: {
        some: {
          userId: neutralUserId,
          role: "NEUTRAL",
          accessStatus: "ACTIVE",
        },
      },
    },
    select: {
      id: true,
      caseNumber: true,
      title: true,
      lifecycleStatus: true,
      closedAt: true,
      updatedAt: true,
      createdAt: true,
      inquiry: { select: { matterName: true } },
      parties: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          organizationName: true,
          representations: {
            select: {
              attorney: {
                select: {
                  firstName: true,
                  lastName: true,
                  lawFirm: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      participants: {
        where: { accessStatus: "ACTIVE" },
        select: {
          id: true,
          role: true,
          userId: true,
          updatedAt: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      },
    },
  });

  return cases.map((row) => {
    const neutralPart = (row.participants || []).find(
      (p) => p.userId === neutralUserId && p.role === "NEUTRAL",
    );
    return {
      ...row,
      matterName: row.inquiry?.matterName || row.title,
      neutralParticipationUpdatedAt: neutralPart?.updatedAt || null,
    };
  });
};

const partyDisplayName = (party) => {
  if (!party) return null;
  if (party.organizationName?.trim()) return party.organizationName.trim();
  return (
    [party.firstName, party.lastName].filter(Boolean).join(" ").trim() || null
  );
};

const collectCaseNameBuckets = (caseRow) => {
  const parties = [];
  const counsel = [];
  const lawFirms = [];
  const otherParticipants = [];

  for (const party of caseRow.parties || []) {
    const name = partyDisplayName(party);
    if (name) parties.push({ name, key: normalizeName(name) });
    for (const rep of party.representations || []) {
      const attorney = rep.attorney;
      if (!attorney) continue;
      const counselName = [attorney.firstName, attorney.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (counselName) {
        counsel.push({ name: counselName, key: normalizeName(counselName) });
      }
      const firmName = attorney.lawFirm?.name?.trim();
      if (firmName) {
        lawFirms.push({ name: firmName, key: normalizeName(firmName) });
      }
    }
  }

  for (const participant of caseRow.participants || []) {
    if (participant.role === "NEUTRAL") continue;
    const name = displayName(participant.user);
    if (name) {
      otherParticipants.push({ name, key: normalizeName(name) });
    }
  }

  return { parties, counsel, lawFirms, otherParticipants };
};

const pushMatchesForCategory = ({
  searchedNames,
  bucket,
  matchType,
  caseRow,
  checkedAt,
  into,
}) => {
  for (const searched of searchedNames) {
    const key = normalizeName(searched);
    if (!key) continue;
    for (const candidate of bucket) {
      if (!candidate.key) continue;
      if (candidate.key !== key && !candidate.key.includes(key) && !key.includes(candidate.key)) {
        continue;
      }
      into.push({
        caseId: caseRow.id,
        matterName: caseRow.matterName,
        matchedParty: searched,
        matchedHistoricalCase: `${caseRow.caseNumber} — ${caseRow.matterName}`,
        matchType,
        matchSource: "FedArb case data",
        severity: "MEDIUM",
        notes: `Matched ${matchType.toLowerCase()} against neutral's assigned matter ${caseRow.caseNumber}.`,
        checkedAt,
        historicalDocumentId: null,
        historicalDocumentName: null,
      });
    }
  }
};

const runMatching = ({
  cases,
  searchWindow,
  parties,
  counsel,
  lawFirms,
  otherParticipants,
}) => {
  const cutoff = fiveYearsCutoff();
  const checkedAt = new Date();
  const inWindow = [];
  const older = [];

  for (const caseRow of cases) {
    const buckets = collectCaseNameBuckets(caseRow);
    const caseMatches = [];
    pushMatchesForCategory({
      searchedNames: parties,
      bucket: buckets.parties,
      matchType: "PARTY_NAME",
      caseRow,
      checkedAt,
      into: caseMatches,
    });
    pushMatchesForCategory({
      searchedNames: counsel,
      bucket: buckets.counsel,
      matchType: "COUNSEL_NAME",
      caseRow,
      checkedAt,
      into: caseMatches,
    });
    pushMatchesForCategory({
      searchedNames: lawFirms,
      bucket: buckets.lawFirms,
      matchType: "LAW_FIRM",
      caseRow,
      checkedAt,
      into: caseMatches,
    });
    pushMatchesForCategory({
      searchedNames: otherParticipants,
      bucket: buckets.otherParticipants,
      matchType: "OTHER_PARTICIPANT",
      caseRow,
      checkedAt,
      into: caseMatches,
    });

    if (!caseMatches.length) continue;
    if (caseInSearchWindow(caseRow, searchWindow, cutoff)) {
      inWindow.push(...caseMatches);
    } else {
      older.push(...caseMatches);
    }
  }

  const mattersTotal = cases.length;
  const mattersSearched =
    searchWindow === ConflictsSearchWindow.ALL_RECORDS
      ? mattersTotal
      : cases.filter((c) => caseInSearchWindow(c, searchWindow, cutoff)).length;

  return {
    matches: inWindow,
    olderMatchCount:
      searchWindow === ConflictsSearchWindow.LAST_5_YEARS ? older.length : 0,
    mattersSearched,
    mattersTotal,
  };
};

const buildTitle = (status, matchCount, searchWindow) => {
  const windowPhrase =
    searchWindow === ConflictsSearchWindow.ALL_RECORDS
      ? "All Records"
      : "the Last 5 Years";
  if (status === ConflictsCheckStatus.CLEAR) {
    return `No Matches in ${windowPhrase}`;
  }
  const noun = matchCount === 1 ? "Conflict" : "Conflicts";
  if (searchWindow === ConflictsSearchWindow.ALL_RECORDS) {
    return `${matchCount} ${noun} Found in All Records`;
  }
  return `${matchCount} ${noun} Found in the Last 5 Years`;
};

const mapCheckDto = (row) => {
  const neutralName = displayName(row.neutralUser);
  const runBy = displayName(row.runByUser);
  const matches = (row.matches || []).map((m) => ({
    id: m.id,
    caseId: m.caseId,
    matterName: m.matterName,
    matchedParty: m.matchedParty,
    matchedHistoricalCase: m.matchedHistoricalCase,
    matchType: m.matchType,
    matchSource: m.matchSource,
    severity: m.severity,
    notes: m.notes,
    checkedAt: m.checkedAt,
    historicalDocumentId: m.historicalDocumentId,
    historicalDocumentName: m.historicalDocumentName,
  }));

  return {
    id: row.id,
    status: row.status,
    resultLabel: row.resultLabel,
    title: row.title,
    neutralUserId: row.neutralUserId,
    neutralName,
    matterName: row.matterName,
    searchWindow: row.searchWindow,
    windowLabel: row.windowLabel,
    namesSearched: row.namesSearched,
    mattersSearched: row.mattersSearched,
    mattersTotal: row.mattersTotal,
    runAt: row.runAt,
    runBy,
    olderMatchCount: row.olderMatchCount,
    matches,
    report: {
      id: row.id,
      title: row.title,
      status: row.status,
      resultLabel: row.resultLabel,
      neutralName,
      matterName: row.matterName,
      windowLabel: row.windowLabel,
      namesSearched: row.namesSearched,
      mattersSearched: row.mattersSearched,
      mattersTotal: row.mattersTotal,
      runAt: row.runAt,
      runBy,
      olderMatchCount: row.olderMatchCount,
      matches,
    },
  };
};

const listNeutrals = async (currentUser) => {
  assertCanAccessConflictsChecks(currentUser);
  const users = await conflictsCheckRepository.listActiveNeutrals();
  return {
    neutrals: users.map((user) => ({
      id: user.id,
      displayName: displayName(user),
    })),
  };
};

const createConflictsCheck = async (payload, currentUser) => {
  assertCanAccessConflictsChecks(currentUser);

  const neutral = await prisma.user.findFirst({
    where: {
      id: payload.neutralUserId,
      role: { name: "NEUTRAL" },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      prefix: true,
      status: true,
    },
  });
  if (!neutral) {
    throw new ApiError(404, "Neutral user not found.");
  }

  const parties = cleanNameList(payload.parties);
  const counsel = cleanNameList(payload.counsel);
  const lawFirms = cleanNameList(payload.lawFirms);
  const otherParticipants = cleanNameList(payload.otherParticipants);
  const searchWindow =
    payload.searchWindow || ConflictsSearchWindow.LAST_5_YEARS;
  const namesSearched =
    parties.length + counsel.length + lawFirms.length + otherParticipants.length;

  const cases = await loadNeutralCases(neutral.id);
  const { matches, olderMatchCount, mattersSearched, mattersTotal } =
    runMatching({
      cases,
      searchWindow,
      parties,
      counsel,
      lawFirms,
      otherParticipants,
    });

  const status =
    matches.length > 0
      ? ConflictsCheckStatus.CONFLICTS_FOUND
      : ConflictsCheckStatus.CLEAR;
  const windowLabel = windowLabelFor(searchWindow);
  const title = buildTitle(status, matches.length, searchWindow);
  const resultLabel =
    status === ConflictsCheckStatus.CLEAR ? "Clear" : "Conflicts Found";
  const matterName = payload.matterName?.trim() || null;

  const created = await prisma.conflictsCheck.create({
    data: {
      neutralUserId: neutral.id,
      matterName,
      searchWindow,
      parties,
      counsel,
      lawFirms,
      otherParticipants,
      status,
      title,
      resultLabel,
      windowLabel,
      namesSearched,
      mattersSearched,
      mattersTotal,
      olderMatchCount,
      runAt: new Date(),
      runByUserId: currentUser.id,
      matches: {
        create: matches.map((m) => ({
          caseId: m.caseId,
          matterName: m.matterName,
          matchedParty: m.matchedParty,
          matchedHistoricalCase: m.matchedHistoricalCase,
          matchType: m.matchType,
          matchSource: m.matchSource,
          severity: m.severity,
          notes: m.notes,
          checkedAt: m.checkedAt,
          historicalDocumentId: m.historicalDocumentId,
          historicalDocumentName: m.historicalDocumentName,
        })),
      },
    },
    select: conflictsCheckRepository.checkSelect,
  });

  return mapCheckDto(created);
};

const listConflictsChecks = async (query, currentUser) => {
  assertCanAccessConflictsChecks(currentUser);
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 50, 100);
  const where = {
    ...(query.neutralUserId && { neutralUserId: query.neutralUserId }),
  };
  const [rows, total] = await conflictsCheckRepository.list({
    where,
    skip: (page - 1) * limit,
    take: limit,
  });

  return {
    checks: rows.map((row) => ({
      ...mapCheckDto({ ...row, matches: [] }),
      matchCount: row._count?.matches || 0,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    },
  };
};

const getConflictsCheckById = async (id, currentUser) => {
  assertCanAccessConflictsChecks(currentUser);
  const row = await conflictsCheckRepository.findById(id);
  if (!row) throw new ApiError(404, "Conflicts check not found.");
  return mapCheckDto(row);
};

const resolveChromeExecutable = () => {
  for (const candidate of SYSTEM_CHROME_CANDIDATES) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {
      /* continue */
    }
  }
  return null;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const buildConflictsCheckHtml = (dto) => {
  const rows =
    dto.matches?.length > 0
      ? dto.matches
          .map(
            (m) => `
        <tr>
          <td>${escapeHtml(m.matchedParty)}</td>
          <td>${escapeHtml(m.matchedHistoricalCase)}</td>
          <td>${escapeHtml(m.matchType)}</td>
          <td>${escapeHtml(m.severity)}</td>
          <td>${escapeHtml(m.notes)}</td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="5">No matches.</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 32px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #555; font-size: 12px; margin-bottom: 20px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: 700; }
    .clear { background: #dcfce7; color: #166534; }
    .found { background: #fee2e2; color: #991b1b; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
  <h1>Conflict of Interest Report</h1>
  <div class="meta">
    <div><strong>${escapeHtml(dto.title)}</strong>
      <span class="badge ${dto.status === "CLEAR" ? "clear" : "found"}">${escapeHtml(dto.resultLabel)}</span>
    </div>
    <div>Neutral: ${escapeHtml(dto.neutralName)}</div>
    <div>Matter: ${escapeHtml(dto.matterName || "—")}</div>
    <div>Window: ${escapeHtml(dto.windowLabel)}</div>
    <div>${dto.namesSearched} names searched against ${dto.mattersSearched} of ${dto.mattersTotal} matters</div>
    <div>Run ${escapeHtml(new Date(dto.runAt).toISOString())} by ${escapeHtml(dto.runBy)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Matched Name</th>
        <th>Historical Matter</th>
        <th>Type</th>
        <th>Severity</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
};

const exportConflictsCheckPdf = async (id, currentUser) => {
  const dto = await getConflictsCheckById(id, currentUser);
  const html = buildConflictsCheckHtml(dto);
  const executablePath = resolveChromeExecutable();
  const browser = await puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const buffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", right: "12mm", bottom: "16mm", left: "12mm" },
    });
    const safeName = (dto.neutralName || "neutral")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    return {
      buffer,
      filename: `conflicts-check-${safeName}-${dto.id.slice(0, 8)}.pdf`,
    };
  } finally {
    await browser.close();
  }
};

module.exports = {
  listNeutrals,
  createConflictsCheck,
  listConflictsChecks,
  getConflictsCheckById,
  exportConflictsCheckPdf,
};
