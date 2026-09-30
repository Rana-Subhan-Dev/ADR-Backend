const prisma = require("../config/prisma");
const { accessibleCaseWhere } = require("../utils/caseAccess");

/**
 * GET /dashboard/overview response shape:
 * {
 *   upcomingHearings: Array<{ id, caseId, caseNumber, caseTitle, title, hearingDate, hearingStatus, format }>,
 *   followUps: Array<{ id, caseNumber, title, followUpDate, nextStep }>,
 *   outstandingDocuSign: Array<{ id, caseId, caseNumber, caseTitle, status, templateName, dueDate, sentAt }>,
 *   overdueInvoices: Array<{ id, caseId, caseNumber, caseTitle, invoiceNumber, dueDate, amountDue, invoiceStatus, paymentStatus }>,
 * }
 */

const DEFAULT_HEARING_LIMIT = 10;
const DEFAULT_FOLLOW_UP_DAYS = 30;

const caseScope = (currentUser) => accessibleCaseWhere(currentUser);

const upcomingHearings = async (currentUser, limit) => {
  const now = new Date();
  const scope = caseScope(currentUser);
  return prisma.hearing.findMany({
    where: {
      hearingStatus: { notIn: ["CANCELLED"] },
      hearingDate: { gte: now },
      ...(Object.keys(scope).length && { case: scope }),
    },
    orderBy: [{ hearingDate: "asc" }, { id: "asc" }],
    take: limit,
    select: {
      id: true,
      caseId: true,
      title: true,
      hearingDate: true,
      hearingStatus: true,
      format: true,
      case: { select: { caseNumber: true, title: true } },
    },
  }).then((rows) =>
    rows.map((row) => ({
      id: row.id,
      caseId: row.caseId,
      caseNumber: row.case?.caseNumber ?? null,
      caseTitle: row.case?.title ?? null,
      title: row.title,
      hearingDate: row.hearingDate,
      hearingStatus: row.hearingStatus,
      format: row.format,
    })),
  );
};

const followUps = async (currentUser, from, to) => {
  const scope = caseScope(currentUser);
  return prisma.case.findMany({
    where: {
      followUpDate: { gte: from, lte: to },
      ...(Object.keys(scope).length ? scope : {}),
    },
    orderBy: [{ followUpDate: "asc" }, { id: "asc" }],
    take: 50,
    select: {
      id: true,
      caseNumber: true,
      title: true,
      followUpDate: true,
      nextStep: true,
    },
  });
};

const outstandingDocuSign = async (currentUser) => {
  const scope = caseScope(currentUser);
  return prisma.docuSignEnvelope.findMany({
    where: {
      status: { notIn: ["COMPLETED", "DECLINED", "EXPIRED"] },
      ...(Object.keys(scope).length && { case: scope }),
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      caseId: true,
      status: true,
      templateName: true,
      dueDate: true,
      sentAt: true,
      case: { select: { caseNumber: true, title: true } },
    },
  }).then((rows) =>
    rows.map((row) => ({
      id: row.id,
      caseId: row.caseId,
      caseNumber: row.case?.caseNumber ?? null,
      caseTitle: row.case?.title ?? null,
      status: row.status,
      templateName: row.templateName,
      dueDate: row.dueDate,
      sentAt: row.sentAt,
    })),
  );
};

const overdueInvoices = async (currentUser) => {
  const scope = caseScope(currentUser);
  const now = new Date();
  return prisma.invoice.findMany({
    where: {
      OR: [
        { invoiceStatus: "OVERDUE" },
        {
          dueDate: { lt: now },
          paymentStatus: { not: "PAID" },
          invoiceStatus: { notIn: ["DRAFT", "VOID"] },
        },
      ],
      ...(Object.keys(scope).length && { case: scope }),
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      caseId: true,
      invoiceNumber: true,
      dueDate: true,
      amountDue: true,
      invoiceStatus: true,
      paymentStatus: true,
      case: { select: { caseNumber: true, title: true } },
    },
  }).then((rows) =>
    rows.map((row) => ({
      id: row.id,
      caseId: row.caseId,
      caseNumber: row.case?.caseNumber ?? null,
      caseTitle: row.case?.title ?? null,
      invoiceNumber: row.invoiceNumber,
      dueDate: row.dueDate,
      amountDue: row.amountDue,
      invoiceStatus: row.invoiceStatus,
      paymentStatus: row.paymentStatus,
    })),
  );
};

const getOverview = async (query, currentUser) => {
  const hearingLimit =
    Number(query.upcomingHearingsLimit) || DEFAULT_HEARING_LIMIT;
  const followUpDays = Number(query.followUpDays) || DEFAULT_FOLLOW_UP_DAYS;
  const from = query.followUpFrom
    ? new Date(query.followUpFrom)
    : new Date();
  const to = query.followUpTo
    ? new Date(query.followUpTo)
    : new Date(Date.now() + followUpDays * 24 * 60 * 60 * 1000);

  const [
    upcomingHearingsList,
    followUpsList,
    outstandingDocuSignList,
    overdueInvoicesList,
  ] = await Promise.all([
    upcomingHearings(currentUser, hearingLimit),
    followUps(currentUser, from, to),
    outstandingDocuSign(currentUser),
    overdueInvoices(currentUser),
  ]);

  return {
    upcomingHearings: upcomingHearingsList,
    followUps: followUpsList,
    outstandingDocuSign: outstandingDocuSignList,
    overdueInvoices: overdueInvoicesList,
  };
};

module.exports = { getOverview };
