const prisma = require("../config/prisma");
const ApiError = require("../utils/apiError");
const { RoleName } = require("../constants/auth.constants");
const { NEUTRAL_READINESS_LABELS } = require("../constants/case.constants");
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
      caseManagerEmail: caseManager?.user?.email || null,
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

const DEFAULT_CLIENT_CASES_LIMIT = 10;

const partyNameFromRecord = (party) => {
  if (!party) return null;
  if (party.organizationName?.trim()) return party.organizationName.trim();
  const name = [party.firstName, party.lastName].filter(Boolean).join(" ").trim();
  return name || null;
};

const clientMyCases = async (currentUser, limit) => {
  const scope = caseScope(currentUser);
  const now = new Date();
  const rows = await prisma.case.findMany({
    where: Object.keys(scope).length ? scope : {},
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      caseNumber: true,
      title: true,
      caseType: true,
      lifecycleStatus: true,
      participants: {
        where: {
          OR: [
            {
              accessStatus: "ACTIVE",
              role: { in: ["CASE_MANAGER", "NEUTRAL"] },
            },
            { userId: currentUser.id, role: "CLIENT" },
          ],
        },
        select: {
          role: true,
          userId: true,
          user: {
            select: { firstName: true, lastName: true, email: true },
          },
          caseParty: {
            select: {
              organizationName: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
      hearings: {
        where: {
          hearingStatus: { notIn: ["CANCELLED"] },
          hearingDate: { gte: now },
        },
        orderBy: [{ hearingDate: "asc" }],
        take: 1,
        select: { hearingDate: true },
      },
    },
  });

  return rows.map((row) => {
    const participants = row.participants || [];
    const caseManager = participants.find((p) => p.role === "CASE_MANAGER");
    const neutral = participants.find((p) => p.role === "NEUTRAL");
    const clientParticipant = participants.find(
      (p) => p.role === "CLIENT" && p.userId === currentUser.id,
    );
    return {
      id: row.id,
      caseNumber: row.caseNumber,
      title: row.title,
      caseType: row.caseType,
      lifecycleStatus: row.lifecycleStatus,
      caseManagerName: displayName(caseManager?.user),
      neutralName: displayName(neutral?.user),
      partyName: partyNameFromRecord(clientParticipant?.caseParty),
      nextHearingDate: row.hearings?.[0]?.hearingDate || null,
    };
  });
};

const getClientDashboard = async (query, currentUser) => {
  if (currentUser?.role?.name !== RoleName.CLIENT) {
    throw new ApiError(403, "Client dashboard is only available to CLIENT users.");
  }

  const hearingsLimit =
    Number(query.hearingsLimit) || DEFAULT_LAWYER_SECTION_LIMIT;
  const signaturesLimit =
    Number(query.signaturesLimit) || DEFAULT_LAWYER_SECTION_LIMIT;
  const invoicesLimit =
    Number(query.invoicesLimit) || DEFAULT_LAWYER_SECTION_LIMIT;
  const documentsLimit =
    Number(query.documentsLimit) || DEFAULT_LAWYER_SECTION_LIMIT;
  const casesLimit = Number(query.casesLimit) || DEFAULT_CLIENT_CASES_LIMIT;

  const [
    upcomingHearingsList,
    pendingSignatures,
    invoicesDue,
    recentDocuments,
    myCases,
  ] = await Promise.all([
    lawyerUpcomingHearings(currentUser, hearingsLimit),
    lawyerPendingSignatures(currentUser, signaturesLimit),
    lawyerInvoicesDue(currentUser, invoicesLimit),
    lawyerRecentDocuments(currentUser, documentsLimit),
    clientMyCases(currentUser, casesLimit),
  ]);

  return {
    upcomingHearings: upcomingHearingsList,
    pendingSignatures,
    invoicesDue,
    invoicePaymentStatus: invoicesDue[0] || null,
    recentDocuments,
    myCases,
  };
};

const ACCOUNTING_DASHBOARD_ROLES = new Set([
  RoleName.ACCOUNTING_STAFF,
  RoleName.SUPER_ADMIN,
]);

const DEFAULT_PAYMENT_ACTIVITY_LIMIT = 6;
const DEFAULT_SYNC_FAILURE_LIMIT = 10;

const roundMoneyDash = (value) => Math.round(Number(value || 0) * 100) / 100;

const partyNameFromCaseParty = (party) => {
  if (!party) return null;
  if (party.organizationName?.trim()) return party.organizationName.trim();
  const name = [party.firstName, party.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || party.email || null;
};

const formatOutstandingLabel = (amount) =>
  `$${Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const accountingTimesheetStatus = async () => {
  const [approved, rejected, pendingAudits, draft] = await Promise.all([
    prisma.neutralTimesheet.count({
      where: { approvalStatus: "APPROVED" },
    }),
    prisma.neutralTimesheet.count({
      where: { approvalStatus: "REJECTED" },
    }),
    prisma.neutralTimesheet.count({
      where: { status: "SUBMITTED", approvalStatus: "PENDING" },
    }),
    prisma.neutralTimesheet.count({
      where: {
        NOT: {
          OR: [
            { approvalStatus: "APPROVED" },
            { approvalStatus: "REJECTED" },
            { status: "SUBMITTED", approvalStatus: "PENDING" },
          ],
        },
      },
    }),
  ]);

  return { approved, rejected, draft, pendingAudits };
};

const accountingInvoiceSnapshot = async () => {
  const invoices = await prisma.invoice.findMany({
    where: {
      invoiceStatus: { in: ["ISSUED", "SENT", "OVERDUE"] },
    },
    select: {
      id: true,
      amountDue: true,
      dueDate: true,
      paymentStatus: true,
      invoiceStatus: true,
      payments: { select: { amount: true } },
      creditNotes: { select: { amount: true } },
    },
  });

  const billingService = require("./billing.service");
  const now = new Date();
  let pending = 0;
  let overdue = 0;
  let partial = 0;
  let paid = 0;
  let outstandingBalance = 0;

  const agingTotals = {
    "0-30": 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
  };

  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  for (const invoice of invoices) {
    const balances = billingService.computeInvoiceBalances(invoice, now);

    if (invoice.paymentStatus === "PAID") {
      paid += 1;
    } else if (invoice.paymentStatus === "PARTIAL") {
      partial += 1;
    } else if (balances.overdue) {
      overdue += 1;
    } else if (invoice.paymentStatus === "UNPAID") {
      pending += 1;
    }

    if (balances.openBalance <= 0) continue;
    outstandingBalance += balances.openBalance;

    const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
    const dueDay = dueDate
      ? new Date(
          Date.UTC(
            dueDate.getUTCFullYear(),
            dueDate.getUTCMonth(),
            dueDate.getUTCDate(),
          ),
        )
      : null;
    const daysPastDue = dueDay
      ? Math.max(0, Math.floor((today - dueDay) / (1000 * 60 * 60 * 24)))
      : 0;

    if (daysPastDue <= 30) agingTotals["0-30"] += balances.openBalance;
    else if (daysPastDue <= 60) agingTotals["31-60"] += balances.openBalance;
    else if (daysPastDue <= 90) agingTotals["61-90"] += balances.openBalance;
    else agingTotals["90+"] += balances.openBalance;
  }

  outstandingBalance = roundMoneyDash(outstandingBalance);
  const totalOutstanding = outstandingBalance;
  const bucketDefs = [
    { id: "0-30", label: "Current (0-30 days)" },
    { id: "31-60", label: "31-60 days" },
    { id: "61-90", label: "61-90 days" },
    { id: "90+", label: "90+ days" },
  ];

  const buckets = bucketDefs.map((def) => {
    const amount = roundMoneyDash(agingTotals[def.id]);
    const percent =
      totalOutstanding > 0
        ? Math.round((amount / totalOutstanding) * 100)
        : 0;
    return { ...def, amount, percent };
  });

  return {
    invoiceStatus: {
      pending,
      overdue,
      partial,
      paid,
      outstandingBalance,
    },
    invoiceAging: {
      totalOutstanding,
      buckets,
    },
  };
};

const accountingQuickBooksSync = async (syncFailureLimit) => {
  const where = {
    integrationType: "QUICKBOOKS",
    status: "FAILED",
  };

  const [failureCount, logs] = await Promise.all([
    prisma.integrationSyncLog.count({ where }),
    prisma.integrationSyncLog.findMany({
      where,
      orderBy: [{ lastAttemptAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: syncFailureLimit,
      select: {
        id: true,
        relatedRecordType: true,
        relatedRecordId: true,
        errorMessage: true,
        status: true,
        lastAttemptAt: true,
        createdAt: true,
      },
    }),
  ]);

  const invoiceIds = logs
    .filter((log) => log.relatedRecordType === "Invoice")
    .map((log) => log.relatedRecordId);
  const paymentIds = logs
    .filter((log) => log.relatedRecordType === "Payment")
    .map((log) => log.relatedRecordId);

  const [invoices, payments] = await Promise.all([
    invoiceIds.length
      ? prisma.invoice.findMany({
          where: { id: { in: invoiceIds } },
          select: { id: true, invoiceNumber: true },
        })
      : Promise.resolve([]),
    paymentIds.length
      ? prisma.payment.findMany({
          where: { id: { in: paymentIds } },
          select: {
            id: true,
            invoice: { select: { invoiceNumber: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const invoiceById = new Map(invoices.map((row) => [row.id, row]));
  const paymentById = new Map(payments.map((row) => [row.id, row]));

  const failures = logs.map((log) => {
    let recordRef = log.relatedRecordId;
    let recordType = log.relatedRecordType || "Record";

    if (log.relatedRecordType === "Invoice") {
      const invoice = invoiceById.get(log.relatedRecordId);
      recordRef = invoice?.invoiceNumber || recordRef;
      recordType = "Invoice";
    } else if (log.relatedRecordType === "Payment") {
      const payment = paymentById.get(log.relatedRecordId);
      recordRef = payment?.invoice?.invoiceNumber
        ? `PAY-${String(log.relatedRecordId).slice(0, 8).toUpperCase()}`
        : `PAY-${String(log.relatedRecordId).slice(0, 8).toUpperCase()}`;
      recordType = "Payment Status";
    }

    return {
      id: log.id,
      recordRef,
      recordType,
      relatedRecordId: log.relatedRecordId,
      relatedRecordType: log.relatedRecordType,
      errorMessage: log.errorMessage || "Sync failed",
      lastAttemptAt: log.lastAttemptAt || log.createdAt,
      status: log.status,
    };
  });

  return { failureCount, failures };
};

const accountingPaymentActivity = async (limit) => {
  const billingService = require("./billing.service");
  const payments = await prisma.payment.findMany({
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      amount: true,
      paymentDate: true,
      createdAt: true,
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          amountDue: true,
          dueDate: true,
          paymentStatus: true,
          invoiceStatus: true,
          payerCaseParty: {
            select: {
              firstName: true,
              lastName: true,
              organizationName: true,
              email: true,
            },
          },
          payments: { select: { amount: true } },
          creditNotes: { select: { amount: true } },
        },
      },
    },
  });

  const now = new Date();
  return payments.map((payment) => {
    const invoice = payment.invoice;
    const balances = billingService.computeInvoiceBalances(invoice, now);
    const payerName =
      partyNameFromCaseParty(invoice?.payerCaseParty) || "payer";
    const invoiceNumber = invoice?.invoiceNumber || "Invoice";
    const paymentStatus = invoice?.paymentStatus || null;
    const outstanding = balances.openBalance;
    const overdue = balances.overdue;

    let tone = "orange";
    let text = `${invoiceNumber} awaiting payment from ${payerName}`;

    if (paymentStatus === "PAID" || outstanding <= 0) {
      tone = "green";
      text = `${invoiceNumber} paid in full by ${payerName}`;
    } else if (paymentStatus === "PARTIAL") {
      tone = "orange";
      text = `Partial payment recorded for ${invoiceNumber} — ${formatOutstandingLabel(outstanding)} outstanding`;
    } else if (overdue) {
      tone = "red";
      text = `${invoiceNumber} overdue — ${formatOutstandingLabel(outstanding)} from ${payerName}`;
    }

    return {
      id: payment.id,
      invoiceId: invoice?.id || null,
      invoiceNumber,
      payerName,
      paymentStatus,
      outstanding,
      text,
      occurredAt: payment.paymentDate || payment.createdAt,
      tone,
    };
  });
};

const getAccountingDashboard = async (query, currentUser) => {
  if (!ACCOUNTING_DASHBOARD_ROLES.has(currentUser?.role?.name)) {
    throw new ApiError(
      403,
      "Accounting dashboard is only available to ACCOUNTING_STAFF and SUPER_ADMIN users.",
    );
  }

  const paymentActivityLimit =
    Number(query.paymentActivityLimit) || DEFAULT_PAYMENT_ACTIVITY_LIMIT;
  const syncFailureLimit =
    Number(query.syncFailureLimit) || DEFAULT_SYNC_FAILURE_LIMIT;

  const [timesheetStatus, invoiceSnapshot, quickBooksSync, paymentActivity] =
    await Promise.all([
      accountingTimesheetStatus(),
      accountingInvoiceSnapshot(),
      accountingQuickBooksSync(syncFailureLimit),
      accountingPaymentActivity(paymentActivityLimit),
    ]);

  return {
    timesheetStatus,
    invoiceStatus: invoiceSnapshot.invoiceStatus,
    invoiceAging: invoiceSnapshot.invoiceAging,
    quickBooksSync,
    paymentActivity,
  };
};

const DEFAULT_NEUTRAL_HEARINGS_LIMIT = 5;
const DEFAULT_NEUTRAL_CASES_LIMIT = 10;
const NEUTRAL_NEW_DOCUMENT_DAYS = 30;

const HEARING_TYPE_LABELS = {
  MEDIATION_SESSION: "Mediation Session",
  ARBITRATION_HEARING: "Arbitration Hearing",
  STATUS_CONFERENCE: "Status Conference",
  CUSTOM: "Custom",
};

const neutralDocumentVisibilityOr = (currentUser) => [
  { uploadedByUserId: currentUser.id },
  {
    visibility: "ALL_AUTHORIZED_PARTICIPANTS",
    case: {
      participants: {
        some: { userId: currentUser.id, accessStatus: "ACTIVE" },
      },
    },
  },
  {
    visibility: "NEUTRAL_ONLY",
    case: {
      participants: {
        some: {
          userId: currentUser.id,
          role: "NEUTRAL",
          accessStatus: "ACTIVE",
        },
      },
    },
  },
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
];

const mapNeutralUpcomingHearing = (row) => {
  const participants = row.case?.participants || [];
  const caseManager = participants.find((p) => p.role === "CASE_MANAGER");
  return {
    id: row.id,
    caseId: row.caseId,
    caseNumber: row.case?.caseNumber ?? null,
    caseTitle: row.case?.title ?? null,
    title: row.title,
    hearingType: row.type ?? null,
    hearingTypeLabel: row.type
      ? HEARING_TYPE_LABELS[row.type] || row.type
      : null,
    hearingDate: row.hearingDate,
    durationMinutes: row.durationMinutes ?? null,
    timezone: row.timezone ?? null,
    hearingStatus: row.hearingStatus,
    format: row.format,
    zoomJoinUrl: row.zoomJoinUrl ?? null,
    zoomStatus: row.zoomStatus ?? null,
    caseManagerName: displayName(caseManager?.user),
    caseManagerEmail: caseManager?.user?.email || null,
  };
};

const neutralUpcomingHearings = async (currentUser, limit) => {
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
      type: true,
      hearingDate: true,
      durationMinutes: true,
      timezone: true,
      hearingStatus: true,
      format: true,
      zoomJoinUrl: true,
      zoomStatus: true,
      case: {
        select: {
          caseNumber: true,
          title: true,
          participants: {
            where: {
              accessStatus: "ACTIVE",
              role: "CASE_MANAGER",
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

  return rows.map(mapNeutralUpcomingHearing);
};

const mapNeutralCalendarHearing = (row) => ({
  id: row.id,
  caseId: row.caseId,
  caseNumber: row.case?.caseNumber ?? null,
  caseTitle: row.case?.title ?? null,
  title: row.title,
  hearingDate: row.hearingDate,
  hearingStatus: row.hearingStatus,
  format: row.format,
});

const neutralCalendarHearings = async (currentUser, from, to) => {
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
      case: { select: { caseNumber: true, title: true } },
    },
  });
  return rows.map(mapNeutralCalendarHearing);
};

const neutralAssignedCases = async (currentUser, limit) => {
  const scope = caseScope(currentUser);
  const now = new Date();
  const rows = await prisma.case.findMany({
    where: Object.keys(scope).length ? scope : {},
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      caseNumber: true,
      title: true,
      caseType: true,
      lifecycleStatus: true,
      disputeCategory: { select: { name: true } },
      _count: { select: { parties: true } },
      participants: {
        where: {
          accessStatus: "ACTIVE",
          role: "CASE_MANAGER",
        },
        select: {
          role: true,
          user: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      },
      hearings: {
        where: {
          hearingStatus: { notIn: ["CANCELLED"] },
          hearingDate: { gte: now },
        },
        orderBy: [{ hearingDate: "asc" }],
        take: 1,
        select: { hearingDate: true },
      },
    },
  });

  return rows.map((row) => {
    const caseManager = (row.participants || []).find(
      (p) => p.role === "CASE_MANAGER",
    );
    return {
      id: row.id,
      caseNumber: row.caseNumber,
      title: row.title,
      caseType: row.caseType,
      disputeType: row.disputeCategory?.name || null,
      lifecycleStatus: row.lifecycleStatus,
      caseManagerName: displayName(caseManager?.user),
      partiesCount: row._count?.parties ?? 0,
      nextHearingDate: row.hearings?.[0]?.hearingDate || null,
    };
  });
};

const countNeutralVisibleDocuments = async (currentUser, extraWhere = {}) => {
  const scope = caseScope(currentUser);
  return prisma.document.count({
    where: {
      deletedAt: null,
      ...(Object.keys(scope).length ? { case: scope } : {}),
      OR: neutralDocumentVisibilityOr(currentUser),
      ...extraWhere,
    },
  });
};

const neutralDocumentAlerts = async (currentUser) => {
  const scope = caseScope(currentUser);
  const now = new Date();
  const since = new Date(
    now.getTime() - NEUTRAL_NEW_DOCUMENT_DAYS * 24 * 60 * 60 * 1000,
  );

  const [newDocumentsCount, awaitingReviewCount, readinessRows] =
    await Promise.all([
      countNeutralVisibleDocuments(currentUser, {
        uploadedByUserId: { not: currentUser.id },
        createdAt: { gte: since },
        NOT: {
          accessLogs: {
            some: {
              accessedByUserId: currentUser.id,
              action: "VIEWED",
            },
          },
        },
      }),
      countNeutralVisibleDocuments(currentUser, {
        reviewStatus: "PENDING_REVIEW",
      }),
      prisma.checklistItem.findMany({
        where: {
          status: { in: ["PENDING", "IN_PROGRESS"] },
          label: { in: [...NEUTRAL_READINESS_LABELS] },
          ...(Object.keys(scope).length ? { case: scope } : {}),
        },
        select: {
          label: true,
          updatedAt: true,
          case: {
            select: {
              hearings: {
                where: {
                  hearingStatus: { notIn: ["CANCELLED"] },
                  hearingDate: { gte: now },
                },
                take: 1,
                select: { id: true },
              },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 50,
      }),
    ]);

  const alerts = [];

  if (newDocumentsCount > 0) {
    alerts.push({
      id: "new-documents",
      kind: "NEW_DOCUMENTS",
      title: `${newDocumentsCount} new document${newDocumentsCount === 1 ? "" : "s"} shared with you`,
      count: newDocumentsCount,
      linkLabel: "Review Documents",
      hrefHint: "documents",
    });
  }

  if (awaitingReviewCount > 0) {
    alerts.push({
      id: "awaiting-review",
      kind: "AWAITING_REVIEW",
      title: `${awaitingReviewCount} document${awaitingReviewCount === 1 ? "" : "s"} awaiting review`,
      count: awaitingReviewCount,
      linkLabel: "View Pending",
      hrefHint: "documentsPending",
    });
  }

  const preferred = [];
  const fallback = [];
  const seen = new Set();
  for (const row of readinessRows) {
    if (!row.label || seen.has(row.label)) continue;
    seen.add(row.label);
    if (row.case?.hearings?.length) preferred.push(row.label);
    else fallback.push(row.label);
  }
  const readinessItems = [...preferred, ...fallback].slice(0, 3);
  if (readinessItems.length > 0) {
    alerts.push({
      id: "readiness-items",
      kind: "READINESS_ITEMS",
      title: "Upcoming Readiness Items",
      items: readinessItems,
      linkLabel: "Review Documents",
      hrefHint: "documents",
    });
  }

  return alerts;
};

const getNeutralDashboard = async (query, currentUser) => {
  if (currentUser?.role?.name !== RoleName.NEUTRAL) {
    throw new ApiError(
      403,
      "Neutral dashboard is only available to NEUTRAL users.",
    );
  }

  const hearingsLimit =
    Number(query.hearingsLimit) || DEFAULT_NEUTRAL_HEARINGS_LIMIT;
  const casesLimit = Number(query.casesLimit) || DEFAULT_NEUTRAL_CASES_LIMIT;
  const { from, to } = resolveCalendarRange(query);

  const [upcomingHearingsList, documentAlerts, calendarHearings, assignedCases] =
    await Promise.all([
      neutralUpcomingHearings(currentUser, hearingsLimit),
      neutralDocumentAlerts(currentUser),
      neutralCalendarHearings(currentUser, from, to),
      neutralAssignedCases(currentUser, casesLimit),
    ]);

  return {
    upcomingHearings: upcomingHearingsList,
    documentAlerts,
    calendarHearings,
    assignedCases,
  };
};

module.exports = {
  getOverview,
  getLawyerDashboard,
  getCaseManagerDashboard,
  getClientDashboard,
  getAccountingDashboard,
  getNeutralDashboard,
};
