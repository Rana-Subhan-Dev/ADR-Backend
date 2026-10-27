const prisma = require("../config/prisma");
const ApiError = require("../utils/apiError");
const { RoleName } = require("../constants/auth.constants");
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
const DEFAULT_LAWYER_SECTION_LIMIT = 5;

const caseScope = (currentUser) => accessibleCaseWhere(currentUser);

const displayName = (user) => {
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || null;
};

const upcomingHearings = async (currentUser, limit) => {
  const now = new Date();
  const scope = caseScope(currentUser);
  return prisma.hearing
    .findMany({
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
    })
    .then((rows) =>
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
  return prisma.docuSignEnvelope
    .findMany({
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
    })
    .then((rows) =>
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
  return prisma.invoice
    .findMany({
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
    })
    .then((rows) =>
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
  const from = query.followUpFrom ? new Date(query.followUpFrom) : new Date();
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

const lawyerUpcomingHearings = async (currentUser, limit) => {
  const now = new Date();
  const scope = caseScope(currentUser);
  const rows = await prisma.hearing.findMany({
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
      durationMinutes: true,
      hearingStatus: true,
      format: true,
      zoomJoinUrl: true,
      zoomStatus: true,
      case: {
        select: {
          caseNumber: true,
          title: true,
          caseType: true,
          participants: {
            where: {
              accessStatus: "ACTIVE",
              role: { in: ["CASE_MANAGER", "NEUTRAL"] },
            },
            select: {
              role: true,
              user: {
                select: { firstName: true, lastName: true, email: true },
              },
            },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const participants = row.case?.participants || [];
    const caseManager = participants.find((p) => p.role === "CASE_MANAGER");
    const neutral = participants.find((p) => p.role === "NEUTRAL");
    return {
      id: row.id,
      caseId: row.caseId,
      caseNumber: row.case?.caseNumber ?? null,
      caseTitle: row.case?.title ?? null,
      caseType: row.case?.caseType ?? null,
      title: row.title,
      hearingDate: row.hearingDate,
      durationMinutes: row.durationMinutes ?? null,
      hearingStatus: row.hearingStatus,
      format: row.format,
      zoomJoinUrl: row.zoomJoinUrl ?? null,
      zoomStatus: row.zoomStatus ?? null,
      neutralName: displayName(neutral?.user),
      caseManagerName: displayName(caseManager?.user),
    };
  });
};

const lawyerPendingSignatures = async (currentUser, limit) => {
  const scope = caseScope(currentUser);
  const email = (currentUser.email || "").toLowerCase();

  const rows = await prisma.docuSignEnvelope.findMany({
    where: {
      status: { in: ["SENT", "PENDING"] },
      ...(Object.keys(scope).length && { case: scope }),
      recipients: {
        some: {
          status: { in: ["SENT", "DELIVERED"] },
          OR: [
            { email: { equals: email, mode: "insensitive" } },
            { caseParticipant: { userId: currentUser.id } },
          ],
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { sentAt: "desc" }],
    take: limit,
    select: {
      id: true,
      caseId: true,
      status: true,
      dueDate: true,
      sentAt: true,
      sourceDocument: { select: { name: true } },
      sentBy: {
        select: { firstName: true, lastName: true, email: true },
      },
      case: { select: { caseNumber: true, title: true } },
      recipients: {
        where: {
          status: { in: ["SENT", "DELIVERED"] },
          OR: [
            { email: { equals: email, mode: "insensitive" } },
            { caseParticipant: { userId: currentUser.id } },
          ],
        },
        select: { id: true, status: true },
        take: 1,
      },
    },
  });

  return rows.map((row) => ({
    envelopeId: row.id,
    caseId: row.caseId,
    caseNumber: row.case?.caseNumber ?? null,
    caseTitle: row.case?.title ?? null,
    documentName: row.sourceDocument?.name ?? null,
    requestedByName: displayName(row.sentBy),
    dueDate: row.dueDate,
    status: row.status,
    canSign: true,
  }));
};

const lawyerInvoicesDue = async (currentUser, limit) => {
  const scope = caseScope(currentUser);
  const rows = await prisma.invoice.findMany({
    where: {
      invoiceStatus: { notIn: ["DRAFT", "VOID"] },
      paymentStatus: { in: ["UNPAID", "PARTIAL"] },
      ...(Object.keys(scope).length && { case: scope }),
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: limit,
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
  });

  return rows.map((row) => ({
    id: row.id,
    caseId: row.caseId,
    caseNumber: row.case?.caseNumber ?? null,
    caseTitle: row.case?.title ?? null,
    invoiceNumber: row.invoiceNumber,
    amountDue: row.amountDue,
    dueDate: row.dueDate,
    paymentStatus: row.paymentStatus,
    invoiceStatus: row.invoiceStatus,
  }));
};

const lawyerRecentDocuments = async (currentUser, limit) => {
  const scope = caseScope(currentUser);
  const rows = await prisma.document.findMany({
    where: {
      deletedAt: null,
      ...(Object.keys(scope).length ? { case: scope } : {}),
      OR: [
        { visibility: "ALL_AUTHORIZED_PARTICIPANTS" },
        { uploadedByUserId: currentUser.id },
        {
          visibility: "SPECIFIC_PARTY_LAWYER_CLIENT",
          accessGrants: {
            some: {
              caseParticipant: {
                userId: currentUser.id,
                accessStatus: "ACTIVE",
              },
            },
          },
        },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      caseId: true,
      name: true,
      createdAt: true,
      category: { select: { name: true } },
      case: { select: { caseNumber: true, title: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    caseId: row.caseId,
    caseNumber: row.case?.caseNumber ?? null,
    caseTitle: row.case?.title ?? null,
    name: row.name,
    category: row.category?.name ?? null,
    uploadedAt: row.createdAt,
  }));
};

const getLawyerDashboard = async (query, currentUser) => {
  if (currentUser?.role?.name !== RoleName.LAWYER) {
    throw new ApiError(403, "Lawyer dashboard is only available to LAWYER users.");
  }

  const hearingsLimit =
    Number(query.hearingsLimit) || DEFAULT_LAWYER_SECTION_LIMIT;
  const signaturesLimit =
    Number(query.signaturesLimit) || DEFAULT_LAWYER_SECTION_LIMIT;
  const invoicesLimit =
    Number(query.invoicesLimit) || DEFAULT_LAWYER_SECTION_LIMIT;
  const documentsLimit =
    Number(query.documentsLimit) || DEFAULT_LAWYER_SECTION_LIMIT;

  const [
    upcomingHearingsList,
    pendingSignatures,
    invoicesDue,
    recentDocuments,
  ] = await Promise.all([
    lawyerUpcomingHearings(currentUser, hearingsLimit),
    lawyerPendingSignatures(currentUser, signaturesLimit),
    lawyerInvoicesDue(currentUser, invoicesLimit),
    lawyerRecentDocuments(currentUser, documentsLimit),
  ]);

  return {
    upcomingHearings: upcomingHearingsList,
    pendingSignatures,
    invoicesDue,
    recentDocuments,
  };
};

const CM_DASHBOARD_ROLES = new Set([
  RoleName.CASE_MANAGER,
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN_LEADERSHIP,
]);

const DEFAULT_CM_HEARINGS_LIMIT = 5;
const DEFAULT_CM_FOLLOW_UPS_LIMIT = 10;
const DEFAULT_CM_DOCUSIGN_LIMIT = 5;
const DEFAULT_CM_INVOICES_LIMIT = 10;
const MAX_CALENDAR_RANGE_DAYS = 93;

const neutralParticipantSelect = {
  where: { accessStatus: "ACTIVE", role: "NEUTRAL" },
  select: {
    role: true,
    user: { select: { firstName: true, lastName: true, email: true } },
  },
  take: 1,
};

const partyDisplayName = (party) => {
  if (!party) return null;
  if (party.organizationName?.trim()) return party.organizationName.trim();
  const name = [party.firstName, party.lastName].filter(Boolean).join(" ").trim();
  return name || null;
};

const startOfUtcDay = (date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

const followUpDueLabel = (followUpDate, now = new Date()) => {
  if (!followUpDate) return null;
  const due = startOfUtcDay(new Date(followUpDate));
  const today = startOfUtcDay(now);
  if (due.getTime() < today.getTime()) return "Overdue";
  if (due.getTime() === today.getTime()) return "Today";
  return due.toISOString().slice(0, 10);
};

const defaultCalendarMonthRange = (now = new Date()) => {
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
  return { from, to };
};

const resolveCalendarRange = (query) => {
  const defaults = defaultCalendarMonthRange();
  const from = query.calendarFrom
    ? new Date(query.calendarFrom)
    : defaults.from;
  const to = query.calendarTo ? new Date(query.calendarTo) : defaults.to;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new ApiError(400, "calendarFrom and calendarTo must be valid ISO dates.");
  }
  if (from > to) {
    throw new ApiError(400, "calendarFrom must be before or equal to calendarTo.");
  }
  const spanMs = to.getTime() - from.getTime();
  const maxMs = MAX_CALENDAR_RANGE_DAYS * 24 * 60 * 60 * 1000;
  if (spanMs > maxMs) {
    throw new ApiError(
      400,
      `Calendar range cannot exceed ${MAX_CALENDAR_RANGE_DAYS} days.`,
    );
  }
  return { from, to };
};

const mapCmHearing = (row) => {
  const neutral = (row.case?.participants || []).find((p) => p.role === "NEUTRAL");
  return {
    id: row.id,
    caseId: row.caseId,
    caseNumber: row.case?.caseNumber ?? null,
    caseTitle: row.case?.title ?? null,
    title: row.title,
    hearingDate: row.hearingDate,
    hearingStatus: row.hearingStatus,
    format: row.format,
    neutralName: displayName(neutral?.user),
  };
};

const cmUpcomingHearings = async (currentUser, limit) => {
  const now = new Date();
  const scope = caseScope(currentUser);
  const rows = await prisma.hearing.findMany({
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
      case: {
        select: {
          caseNumber: true,
          title: true,
          participants: neutralParticipantSelect,
        },
      },
    },
  });
  return rows.map(mapCmHearing);
};

const cmCalendarHearings = async (currentUser, from, to) => {
  const scope = caseScope(currentUser);
  const rows = await prisma.hearing.findMany({
    where: {
      hearingStatus: { notIn: ["CANCELLED"] },
      hearingDate: { gte: from, lte: to },
      ...(Object.keys(scope).length && { case: scope }),
    },
    orderBy: [{ hearingDate: "asc" }, { id: "asc" }],
    select: {
      id: true,
      caseId: true,
      title: true,
      hearingDate: true,
      hearingStatus: true,
      format: true,
      case: {
        select: {
          caseNumber: true,
          title: true,
          participants: neutralParticipantSelect,
        },
      },
    },
  });
  return rows.map(mapCmHearing);
};

const cmFollowUps = async (currentUser, from, to, limit) => {
  const scope = caseScope(currentUser);
  const rows = await prisma.case.findMany({
    where: {
      followUpDate: { gte: from, lte: to },
      ...(Object.keys(scope).length ? scope : {}),
    },
    orderBy: [{ followUpDate: "asc" }, { id: "asc" }],
    take: limit,
    select: {
      id: true,
      caseNumber: true,
      title: true,
      followUpDate: true,
      nextStep: true,
    },
  });
  const now = new Date();
  return rows.map((row) => ({
    id: row.id,
    caseNumber: row.caseNumber,
    title: row.title,
    followUpDate: row.followUpDate,
    nextStep: row.nextStep,
    dueLabel: followUpDueLabel(row.followUpDate, now),
  }));
};

const cmOutstandingDocuSign = async (currentUser, limit) => {
  const scope = caseScope(currentUser);
  const rows = await prisma.docuSignEnvelope.findMany({
    where: {
      status: { notIn: ["COMPLETED", "DECLINED", "EXPIRED"] },
      ...(Object.keys(scope).length && { case: scope }),
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      caseId: true,
      status: true,
      templateName: true,
      dueDate: true,
      sentAt: true,
      sourceDocument: { select: { name: true } },
      recipients: {
        where: { status: { in: ["SENT", "DELIVERED"] } },
        orderBy: [{ routingOrder: "asc" }],
        take: 1,
        select: { name: true, email: true, status: true },
      },
      case: {
        select: {
          caseNumber: true,
          title: true,
          participants: neutralParticipantSelect,
        },
      },
    },
  });

  return rows.map((row) => {
    const recipient = row.recipients?.[0];
    const recipientSummary =
      recipient?.name?.trim() || recipient?.email || null;
    const neutral = (row.case?.participants || []).find(
      (p) => p.role === "NEUTRAL",
    );
    return {
      id: row.id,
      caseId: row.caseId,
      caseNumber: row.case?.caseNumber ?? null,
      caseTitle: row.case?.title ?? null,
      documentName: row.sourceDocument?.name || row.templateName || null,
      recipientSummary,
      sentAt: row.sentAt,
      dueDate: row.dueDate,
      status: row.status,
      neutralName: displayName(neutral?.user),
    };
  });
};

const cmOverdueInvoices = async (currentUser, limit) => {
  const scope = caseScope(currentUser);
  const now = new Date();
  const rows = await prisma.invoice.findMany({
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
    take: limit,
    select: {
      id: true,
      caseId: true,
      invoiceNumber: true,
      dueDate: true,
      amountDue: true,
      invoiceStatus: true,
      paymentStatus: true,
      payerCaseParty: {
        select: {
          organizationName: true,
          firstName: true,
          lastName: true,
        },
      },
      case: {
        select: {
          caseNumber: true,
          title: true,
          participants: neutralParticipantSelect,
        },
      },
    },
  });

  return rows.map((row) => {
    const neutral = (row.case?.participants || []).find(
      (p) => p.role === "NEUTRAL",
    );
    return {
      id: row.id,
      caseId: row.caseId,
      caseNumber: row.case?.caseNumber ?? null,
      caseTitle: row.case?.title ?? null,
      invoiceNumber: row.invoiceNumber,
      clientName: partyDisplayName(row.payerCaseParty),
      neutralName: displayName(neutral?.user),
      amountDue: row.amountDue,
      dueDate: row.dueDate,
      invoiceStatus: row.invoiceStatus,
      paymentStatus: row.paymentStatus,
    };
  });
};

const getCaseManagerDashboard = async (query, currentUser) => {
  if (!CM_DASHBOARD_ROLES.has(currentUser?.role?.name)) {
    throw new ApiError(
      403,
      "Case manager dashboard is only available to CASE_MANAGER, SUPER_ADMIN, and ADMIN_LEADERSHIP users.",
    );
  }

  const hearingsLimit =
    Number(query.hearingsLimit) || DEFAULT_CM_HEARINGS_LIMIT;
  const followUpsLimit =
    Number(query.followUpsLimit) || DEFAULT_CM_FOLLOW_UPS_LIMIT;
  const docuSignLimit =
    Number(query.docuSignLimit) || DEFAULT_CM_DOCUSIGN_LIMIT;
  const invoicesLimit =
    Number(query.invoicesLimit) || DEFAULT_CM_INVOICES_LIMIT;

  const followUpDays = Number(query.followUpDays) || DEFAULT_FOLLOW_UP_DAYS;
  const followFrom = query.followUpFrom
    ? new Date(query.followUpFrom)
    : new Date();
  const followTo = query.followUpTo
    ? new Date(query.followUpTo)
    : new Date(Date.now() + followUpDays * 24 * 60 * 60 * 1000);

  const { from: calendarFrom, to: calendarTo } = resolveCalendarRange(query);

  const [
    upcomingHearingsList,
    calendarHearings,
    followUpsList,
    outstandingDocuSignList,
    overdueInvoicesList,
  ] = await Promise.all([
    cmUpcomingHearings(currentUser, hearingsLimit),
    cmCalendarHearings(currentUser, calendarFrom, calendarTo),
    cmFollowUps(currentUser, followFrom, followTo, followUpsLimit),
    cmOutstandingDocuSign(currentUser, docuSignLimit),
    cmOverdueInvoices(currentUser, invoicesLimit),
  ]);

  return {
    upcomingHearings: upcomingHearingsList,
    calendarHearings,
    followUps: followUpsList,
    outstandingDocuSign: outstandingDocuSignList,
    overdueInvoices: overdueInvoicesList,
  };
};

module.exports = { getOverview, getLawyerDashboard, getCaseManagerDashboard };
