const prisma = require("../config/prisma");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");
const { RoleName } = require("../constants/auth.constants");

const normalizePartyKey = (party) => {
  if (!party) return null;
  if (party.organizationName?.trim()) {
    return party.organizationName.trim().toLowerCase();
  }
  const name = [party.firstName, party.lastName]
    .filter(Boolean)
    .join(" ")
    .trim()
    .toLowerCase();
  return name || null;
};

const partyDisplayName = (party) => {
  if (!party) return null;
  if (party.organizationName?.trim()) return party.organizationName.trim();
  const name = [party.firstName, party.lastName].filter(Boolean).join(" ").trim();
  return name || null;
};

const buildConflictsReport = async (caseId, currentUser) => {
  if (currentUser?.role?.name !== RoleName.NEUTRAL) {
    throw new ApiError(403, "Conflicts report is only available to NEUTRAL users.");
  }

  const caseData = await caseService.getCaseById(caseId, currentUser);
  const currentParties = await prisma.caseParty.findMany({
    where: { caseId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      organizationName: true,
      side: true,
    },
  });

  const currentKeys = new Map();
  for (const party of currentParties) {
    const key = normalizePartyKey(party);
    if (key) currentKeys.set(key, party);
  }

  const otherCases = await prisma.case.findMany({
    where: {
      id: { not: caseId },
      participants: {
        some: {
          userId: currentUser.id,
          role: "NEUTRAL",
          accessStatus: "ACTIVE",
        },
      },
    },
    select: {
      id: true,
      caseNumber: true,
      title: true,
      parties: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          organizationName: true,
          side: true,
        },
      },
    },
  });

  const matches = [];
  for (const other of otherCases) {
    for (const party of other.parties || []) {
      const key = normalizePartyKey(party);
      if (!key || !currentKeys.has(key)) continue;
      const currentParty = currentKeys.get(key);
      matches.push({
        matchedParty: partyDisplayName(currentParty),
        matchedPartyId: currentParty.id,
        historicalCaseId: other.id,
        historicalCaseNumber: other.caseNumber,
        historicalMatterName: other.title,
        historicalPartyId: party.id,
        historicalPartyName: partyDisplayName(party),
        matchType: "PARTY_NAME",
        result: "POTENTIAL_MATCH",
        severity: "MEDIUM",
        checkedAt: new Date().toISOString(),
        notes: "Matched against Neutral's other FedArb assigned cases (in-DB).",
        storageKey: null,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    panelistId: currentUser.id,
    panelistName: [currentUser.firstName, currentUser.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || currentUser.email,
    caseId: caseData.id,
    caseNumber: caseData.caseNumber,
    matterName: caseData.matterName || caseData.title,
    matches,
  };
};

const getConflicts = async (caseId, currentUser) =>
  buildConflictsReport(caseId, currentUser);

const exportConflictsCsv = async (caseId, currentUser) => {
  const report = await buildConflictsReport(caseId, currentUser);
  if (!report.matches.length) {
    throw new ApiError(404, "No conflict matches to export.");
  }
  const headers = [
    "matchedParty",
    "historicalCaseNumber",
    "historicalMatterName",
    "historicalPartyName",
    "matchType",
    "result",
    "severity",
    "checkedAt",
    "notes",
  ];
  const escape = (value) => {
    const text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [
    headers.join(","),
    ...report.matches.map((row) =>
      headers.map((key) => escape(row[key])).join(","),
    ),
  ];
  return {
    filename: `conflicts-${report.caseNumber || caseId}.csv`,
    contentType: "text/csv; charset=utf-8",
    content: lines.join("\n"),
    report,
  };
};

module.exports = {
  getConflicts,
  exportConflictsCsv,
};
