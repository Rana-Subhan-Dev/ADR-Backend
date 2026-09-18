const prisma = require("../config/prisma");
const {
  READINESS_CHECKLIST_DEFINITIONS,
  READINESS_DERIVED_LABELS,
  CLOSURE_CHECKLIST_LABELS,
} = require("../constants/case.constants");

const buildReadinessSummary = (items) => {
  const total = items.length;
  const notApplicable = items.filter((i) => i.status === "NOT_APPLICABLE").length;
  const complete = items.filter((i) => i.status === "COMPLETE").length;
  const pending = items.filter(
    (i) => i.status === "PENDING" || i.status === "IN_PROGRESS",
  ).length;
  const applicable = total - notApplicable;
  const percentReady =
    applicable > 0 ? Math.round((complete / applicable) * 100) : 0;
  return {
    total,
    complete,
    pending,
    notApplicable,
    applicable,
    percentReady,
  };
};

const evaluateDerivedReadinessStatus = async (caseId, label, tx = prisma) => {
  switch (label) {
    case "Intake complete":
      return (
        (await tx.case.count({
          where: {
            id: caseId,
            lifecycleStatus: { not: "INTAKE" },
          },
        })) > 0
      );
    case "Required case metadata entered": {
      const c = await tx.case.findUnique({
        where: { id: caseId },
        select: {
          title: true,
          caseType: true,
          disputeCategoryId: true,
          jurisdiction: true,
        },
      });
      return Boolean(
        c?.title && c?.caseType && c?.disputeCategoryId && c?.jurisdiction,
      );
    }
    case "Parties added":
      return (await tx.caseParty.count({ where: { caseId } })) > 0;
    case "Attorneys linked":
      return (
        (await tx.partyAttorneyRepresentation.count({
          where: { caseParty: { caseId } },
        })) > 0
      );
    case "Neutral assigned":
      return (
        (await tx.caseParticipant.count({
          where: { caseId, role: "NEUTRAL", accessStatus: "ACTIVE" },
        })) > 0
      );
    case "Participant invitations sent":
      return (
        (await tx.caseParticipant.count({
          where: {
            caseId,
            invitationStatus: { in: ["INVITED", "ACCEPTED"] },
          },
        })) > 0
      );
    case "Participant access accepted where needed": {
      const pending = await tx.caseParticipant.count({
        where: {
          caseId,
          invitationStatus: "INVITED",
        },
      });
      const any = await tx.caseParticipant.count({ where: { caseId } });
      return any > 0 && pending === 0;
    }
    case "Required documents uploaded":
      return (
        (await tx.document.count({
          where: { caseId, deletedAt: null },
        })) > 0
      );
    case "Hearing scheduled":
      return (
        (await tx.hearing.count({
          where: {
            caseId,
            hearingStatus: { notIn: ["CANCELLED"] },
          },
        })) > 0
      );
    case "Calendar invites sent":
      return (
        (await tx.hearing.count({
          where: { caseId, calendarSyncStatus: "SYNCED" },
        })) > 0
      );
    case "Zoom link generated":
      return (
        (await tx.hearing.count({
          where: {
            caseId,
            zoomStatus: { in: ["CREATED", "MANUALLY_LINKED"] },
          },
        })) > 0
      );
    case "DocuSign pending/completed where applicable": {
      const count = await tx.docuSignEnvelope.count({ where: { caseId } });
      if (count === 0) return "NOT_APPLICABLE";
      const open = await tx.docuSignEnvelope.count({
        where: {
          caseId,
          status: { in: ["SENT", "PENDING"] },
        },
      });
      const completed = await tx.docuSignEnvelope.count({
        where: { caseId, status: "COMPLETED" },
      });
      if (completed > 0 && open === 0) return true;
      if (open > 0) return false;
      return completed > 0;
    }
    case "Billing configured where applicable": {
      const config = await tx.billingConfiguration.findUnique({
        where: { caseId },
        select: { id: true },
      });
      if (!config) return "NOT_APPLICABLE";
      return true;
    }
    case "Deposit invoice sent, if applicable": {
      const config = await tx.billingConfiguration.findUnique({
        where: { caseId },
        select: { id: true },
      });
      if (!config) return "NOT_APPLICABLE";
      const sent = await tx.invoice.count({
        where: {
          caseId,
          invoiceType: "DEPOSIT",
          invoiceStatus: { in: ["SENT", "ISSUED", "OVERDUE"] },
        },
      });
      return sent > 0;
    }
    case "Status of deposit, if applicable": {
      const config = await tx.billingConfiguration.findUnique({
        where: { caseId },
        select: { id: true },
      });
      if (!config) return "NOT_APPLICABLE";
      const paid = await tx.invoice.count({
        where: {
          caseId,
          invoiceType: "DEPOSIT",
          paymentStatus: { in: ["PAID", "PARTIAL"] },
        },
      });
      return paid > 0;
    }
    case "Outcome notes added":
      return (
        (await tx.caseNote.count({
          where: { caseId, noteType: "CASE_UPDATE" },
        })) > 0
      );
    case "Closure checklist complete": {
      const items = await tx.checklistItem.findMany({
        where: { caseId, category: "CLOSURE" },
        select: { status: true, label: true },
      });
      if (items.length < CLOSURE_CHECKLIST_LABELS.length) return false;
      return items.every((i) => i.status === "COMPLETE");
    }
    default:
      return null;
  }
};

const ensureReadinessChecklist = async (caseId, tx = prisma) => {
  const existing = await tx.checklistItem.findMany({
    where: { caseId, category: "READINESS" },
    select: { id: true, label: true, status: true, type: true },
  });
  const existingLabels = new Set(existing.map((item) => item.label));
  const missing = READINESS_CHECKLIST_DEFINITIONS.filter(
    (d) => !existingLabels.has(d.label),
  );

  if (missing.length) {
    await tx.checklistItem.createMany({
      data: missing.map((d) => ({
        caseId,
        category: "READINESS",
        label: d.label,
        type: d.type,
        status: "PENDING",
        relatedModule: d.relatedModule,
      })),
    });
  }

  return tx.checklistItem.findMany({
    where: { caseId, category: "READINESS" },
    orderBy: { createdAt: "asc" },
  });
};

const syncDerivedReadinessChecklist = async (caseId, tx = prisma) => {
  const items = await ensureReadinessChecklist(caseId, tx);

  for (const item of items) {
    if (!READINESS_DERIVED_LABELS.has(item.label)) continue;
    if (item.type === "MANUAL") continue;

    const result = await evaluateDerivedReadinessStatus(caseId, item.label, tx);
    if (result === null) continue;

    let nextStatus = item.status;
    if (result === "NOT_APPLICABLE") {
      nextStatus = "NOT_APPLICABLE";
    } else if (result === true) {
      nextStatus = "COMPLETE";
    } else if (item.status === "NOT_APPLICABLE") {
      nextStatus = "PENDING";
    } else if (result === false && item.status === "COMPLETE") {
      // Do not auto-reopen completed derived items once complete (stable progress)
      continue;
    }

    if (nextStatus !== item.status) {
      await tx.checklistItem.update({
        where: { id: item.id },
        data: {
          status: nextStatus,
          ...(nextStatus === "COMPLETE"
            ? { completedAt: new Date() }
            : { completedAt: null, completedByUserId: null }),
        },
      });
      item.status = nextStatus;
    }
  }

  return tx.checklistItem.findMany({
    where: { caseId, category: "READINESS" },
    orderBy: { createdAt: "asc" },
  });
};

module.exports = {
  buildReadinessSummary,
  evaluateDerivedReadinessStatus,
  ensureReadinessChecklist,
  syncDerivedReadinessChecklist,
};
