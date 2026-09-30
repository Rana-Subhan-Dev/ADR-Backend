const prisma = require("../config/prisma");

const caseRepository = require("../repositories/case.repository");
const ApiError = require("../utils/apiError");
const notificationService = require("./notification.service");

const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  CASE_SORT_FIELDS,
  CASE_PREFIXES,
  CLOSURE_CHECKLIST_LABELS,
  CLOSURE_DERIVED_LABELS,
  CLOSABLE_STATUSES,
} = require("../constants/case.constants");

const formatMoney = (value) => {
  if (value === null || value === undefined) return null;
  return Number(value);
};

const partyDisplayName = (party) => {
  if (!party) return null;
  if (party.organizationName) return party.organizationName;
  const name = [party.firstName, party.lastName].filter(Boolean).join(" ").trim();
  return name || null;
};

const userDisplayName = (user) => {
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email || null;
};

const mapLifecycleToCaseStatus = (lifecycleStatus, inquiry) => {
  if (lifecycleStatus === "CLOSED") {
    return { label: "Closed", tone: "closed" };
  }
  if (inquiry?.status === "INQUIRY" && lifecycleStatus === "INTAKE") {
    return { label: "Inquiry", tone: "inquiry" };
  }
  if (lifecycleStatus === "ON_HOLD") {
    return { label: "Case", tone: "onHold" };
  }
  if (["ACTIVE", "REOPENED", "SCHEDULED"].includes(lifecycleStatus)) {
    return { label: "Case", tone: "case" };
  }
  return { label: "Case", tone: "default" };
};

const mapRevenueStatus = (status) => {
  if (!status) return null;
  if (status === "ESTIMATED") {
    return { label: "Estimated", tone: "estimated", status };
  }
  if (status === "INVOICED" || status === "RECEIVED") {
    return { label: "Total Submitted", tone: "submitted", status };
  }
  return { label: status, tone: "default", status };
};

const mapDepositStatus = (invoices, billingConfiguration) => {
  const latest = invoices?.[0];
  if (!latest) {
    if (billingConfiguration?.billingMode === "DEPOSIT_BASED") {
      return { label: "Create Invoice", tone: "action", status: "NONE" };
    }
    return null;
  }
  switch (latest.paymentStatus) {
    case "PAID":
      return { label: "Received", tone: "paid", status: "PAID" };
    case "PARTIAL":
      return { label: "Received Partial", tone: "partial", status: "PARTIAL" };
    case "UNPAID":
      return { label: "Payment Due", tone: "due", status: "UNPAID" };
    default:
      return {
        label: latest.paymentStatus,
        tone: "default",
        status: latest.paymentStatus,
      };
  }
};

const pickNextHearingDate = (hearings = []) => {
  const now = Date.now();
  const withDates = hearings
    .filter((h) => h.hearingDate)
    .map((h) => ({ ...h, ts: new Date(h.hearingDate).getTime() }))
    .sort((a, b) => a.ts - b.ts);

  const upcoming = withDates.find((h) => h.ts >= now);
  return (upcoming || withDates[withDates.length - 1] || null)?.hearingDate || null;
};

const mapCase = (caseRecord) => {
  if (!caseRecord) {
    return caseRecord;
  }

  const {
    participants = [],
    parties = [],
    hearings = [],
    revenueMilestones = [],
    invoices = [],
    billingConfiguration,
    inquiry,
    stage,
    nextStep,
    ...rest
  } = caseRecord;

  const caseManagerParticipant = participants.find(
    (p) => p.role === "CASE_MANAGER" && p.isPrimary,
  );
  const neutralParticipant = participants.find((p) => p.role === "NEUTRAL");

  const milestone1 = revenueMilestones.find((m) => m.sequence === 1) || revenueMilestones[0];
  const milestone2 = revenueMilestones.find((m) => m.sequence === 2) || revenueMilestones[1];

  const partyNames = parties.map(partyDisplayName).filter(Boolean);
  const attorneyNames = [
    ...new Set(
      parties.flatMap((p) =>
        (p.representations || [])
          .map((r) => userDisplayName(r.attorney))
          .filter(Boolean),
      ),
    ),
  ];

  const caseStatus = mapLifecycleToCaseStatus(rest.lifecycleStatus, inquiry);
  const hearingDate = pickNextHearingDate(hearings);

  return {
    ...rest,
    inquiry: inquiry || null,
    stage: stage
      ? {
          id: stage.id,
          name: stage.name,
          label: stage.name,
          sortOrder: stage.sortOrder,
        }
      : null,
    nextStep: nextStep || null,
    nextSteps: nextStep || null,
    type: rest.caseType,
    matterName: inquiry?.matterName || rest.title,
    inquiryDate: inquiry?.inquiryDate || null,
    caseStatus,
    status: rest.lifecycleStatus,
    hearingDate,
    nextHearing: hearingDate
      ? { hearingDate, id: hearings.find((h) => h.hearingDate === hearingDate)?.id }
      : null,
    estRevenue: formatMoney(milestone1?.estimatedAmount),
    revenueDate: milestone1?.revenueDate || null,
    revenueStatus: mapRevenueStatus(milestone1?.status),
    estRevenue2: formatMoney(milestone2?.estimatedAmount),
    revenue2Date: milestone2?.revenueDate || null,
    depositStatus: mapDepositStatus(invoices, billingConfiguration),
    revenueMilestones: revenueMilestones.map((m) => ({
      ...m,
      estimatedAmount: formatMoney(m.estimatedAmount),
    })),
    assignedNeutral: userDisplayName(neutralParticipant?.user),
    assignedNeutralUser: neutralParticipant?.user || null,
    parties: partyNames,
    partyRecords: parties.map((p) => ({
      id: p.id,
      name: partyDisplayName(p),
      side: p.side,
      partyType: p.partyType,
    })),
    attorneys: attorneyNames,
    caseManager: caseManagerParticipant?.user ?? null,
    billingConfiguration: billingConfiguration || null,
    openPathHint:
      caseStatus.label === "Inquiry" ? "inquiry" : "case",
  };
};

const generateCaseNumber = async (caseType, tx) => {
  const prefix = CASE_PREFIXES[caseType];

  if (!prefix) {
    throw new ApiError(400, "Invalid case type.");
  }

  const year = new Date().getFullYear();

  const lastCase = await tx.case.findFirst({
    where: {
      caseNumber: { startsWith: `${prefix}-${year}-` },
    },
    orderBy: { caseNumber: "desc" },
    select: { caseNumber: true },
  });

  let sequence = 1;

  if (lastCase) {
    const lastSequence = Number(lastCase.caseNumber.split("-").pop());

    if (!Number.isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }

  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
};

const assertActiveCaseManager = async (caseManagerId) => {
  const manager = await prisma.user.findUnique({
    where: { id: caseManagerId },
    select: { id: true, status: true, role: { select: { name: true } } },
  });

  if (!manager) {
    throw new ApiError(404, "Case manager not found.");
  }

  if (manager.status !== "ACTIVE") {
    throw new ApiError(400, "Selected case manager is not an active user.");
  }

  if (manager.role.name !== "CASE_MANAGER") {
    throw new ApiError(400, "Selected user must have the Case Manager role.");
  }
};

const createCase = async (rawBody, currentUser) => {
  const {
    normalizeCaseCreatePayload,
  } = require("../utils/cmPayloadNormalize");
  const normalized = normalizeCaseCreatePayload(rawBody);

  const currentUserId =
    typeof currentUser === "string" ? currentUser : currentUser.id;

  const {
    caseManagerId,
    neutralUserId,
    billingBootstrap,
    title,
    summary,
    caseType,
    caseTypeLabel,
    disputeCategoryId,
    disputePartyStructure,
    jurisdiction,
    referralSource,
    isInternational,
    isDraft,
    lifecycleStatus,
    primaryCommunicationMethod,
    notifyOnHearingScheduled,
    notifyOnDocumentUploaded,
    notifyOnCaseUpdate,
    notifyOnDocuSignSent,
    lastContactDate,
    followUpDate,
    nextStep,
  } = normalized;

  if (!title) {
    throw new ApiError(400, "title (caseTitle) is required.");
  }

  if (!isDraft) {
    if (!caseType) throw new ApiError(400, "caseType is required.");
    if (!caseManagerId) throw new ApiError(400, "caseManagerId is required.");
    await assertActiveCaseManager(caseManagerId);
  } else if (caseManagerId) {
    await assertActiveCaseManager(caseManagerId);
  }

  const resolvedCaseType = caseType || "CUSTOM_ADR";
  const resolvedManagerId = caseManagerId || currentUserId;

  if (isDraft && !caseManagerId) {
    // Draft without CM: use creating user if they are CM, else require id
    try {
      await assertActiveCaseManager(resolvedManagerId);
    } catch {
      throw new ApiError(400, "caseManagerId is required to save a draft case.");
    }
  }

  const createdCaseId = await prisma.$transaction(async (tx) => {
    const caseNumber = await generateCaseNumber(resolvedCaseType, tx);

    const newCase = await caseRepository.createCase(
      {
        title,
        summary: summary || null,
        caseType: resolvedCaseType,
        caseTypeLabel: caseTypeLabel || null,
        disputeCategoryId: disputeCategoryId || null,
        disputePartyStructure: disputePartyStructure || null,
        jurisdiction: jurisdiction || null,
        referralSource: referralSource || null,
        isInternational: Boolean(isInternational),
        isDraft: Boolean(isDraft),
        lifecycleStatus: lifecycleStatus || "INTAKE",
        caseNumber,
        primaryCommunicationMethod: primaryCommunicationMethod || null,
        notifyOnHearingScheduled: Boolean(notifyOnHearingScheduled),
        notifyOnDocumentUploaded: Boolean(notifyOnDocumentUploaded),
        notifyOnCaseUpdate: Boolean(notifyOnCaseUpdate),
        notifyOnDocuSignSent: Boolean(notifyOnDocuSignSent),
        lastContactDate: lastContactDate ? new Date(lastContactDate) : null,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        nextStep: nextStep || null,
      },
      tx,
    );

    await caseRepository.setPrimaryCaseManager(
      newCase.id,
      resolvedManagerId,
      tx,
    );

    if (neutralUserId) {
      await tx.caseParticipant.create({
        data: {
          caseId: newCase.id,
          userId: neutralUserId,
          role: "NEUTRAL",
          isPrimary: true,
          assignmentType: "ASSIGNED",
          accessStatus: "ACTIVE",
        },
      });
    }

    if (billingBootstrap) {
      await tx.billingConfiguration.create({
        data: {
          caseId: newCase.id,
          billingType: billingBootstrap.billingType || "FLAT",
          taxApplicability: Boolean(billingBootstrap.taxApplicability),
          deliveryContactEmail: billingBootstrap.deliveryContactEmail || null,
          billingNotes: billingBootstrap.billingNotes || null,
          splitBillingEnabled:
            String(billingBootstrap.payerResponsibility || "").toLowerCase() ===
            "split",
        },
      });
    }

    await tx.caseTimelineEvent.create({
      data: {
        caseId: newCase.id,
        eventType: "CASE_CREATED",
        relatedRecordType: "Case",
        relatedRecordId: newCase.id,
        summary: isDraft
          ? `Draft case ${caseNumber} saved.`
          : `Case ${caseNumber} created.`,
        actorUserId: currentUserId,
      },
    });

    return newCase.id;
  });

  if (!isDraft) {
    const readinessChecklistService = require("./readinessChecklist.service");
    await readinessChecklistService.ensureReadinessChecklist(createdCaseId);
  }

  return mapCase(await caseRepository.findCaseById(createdCaseId));
};

const hasGlobalCaseAccess = (roleName) =>
  ["SUPER_ADMIN", "ADMIN_LEADERSHIP", "ACCOUNTING_STAFF"].includes(roleName);

const assertCaseAccess = async (caseData, currentUser) => {
  const roleName = currentUser.role?.name;

  if (hasGlobalCaseAccess(roleName)) return;

  const participant = await prisma.caseParticipant.findFirst({
    where: {
      caseId: caseData.id,
      userId: currentUser.id,
      role: roleName,
      accessStatus: "ACTIVE",
    },
    select: { id: true },
  });

  if (!participant) {
    throw new ApiError(403, "You do not have access to this case.");
  }
};

const getCaseById = async (id, currentUser) => {
  const caseData = mapCase(await caseRepository.findCaseById(id));

  if (!caseData) {
    throw new ApiError(404, "Case not found.");
  }

  await assertCaseAccess(caseData, currentUser);

  return caseData;
};

const getCases = async (query, currentUser) => {
  const page = Number(query.page) || DEFAULT_PAGE;

  const limit = Math.min(Number(query.limit) || DEFAULT_LIMIT, MAX_LIMIT);

  const {
    search,
    searchFields,
    caseType,
    disputeCategoryId,
    lifecycleStatus,
    caseManagerId,
    followUpDate,
    assignedNeutralId,
    hearingDateFrom,
    hearingDateTo,
    caseStatus,
    stageId,
    stageName,
    revenueStatus,
    sortBy = CASE_SORT_FIELDS.CREATED_AT,
    sortOrder = "desc",
  } = query;

  const where = {};
  const and = [];

  if (!hasGlobalCaseAccess(currentUser.role?.name)) {
    and.push({
      participants: {
        some: {
          userId: currentUser.id,
          role: currentUser.role?.name,
          accessStatus: "ACTIVE",
        },
      },
    });
  } else if (caseManagerId) {
    and.push({
      participants: {
        some: { userId: caseManagerId, role: "CASE_MANAGER" },
      },
    });
  }

  if (search) {
    const term = { contains: search, mode: "insensitive" };
    const field = (searchFields || "all").toLowerCase();
    if (field === "matter" || field === "matter_name") {
      and.push({
        OR: [{ title: term }, { inquiry: { matterName: term } }],
      });
    } else if (field === "case_number" || field === "casenumber") {
      and.push({ caseNumber: term });
    } else if (field === "party") {
      and.push({
        parties: {
          some: {
            OR: [
              { firstName: term },
              { lastName: term },
              { organizationName: term },
            ],
          },
        },
      });
    } else if (field === "attorney") {
      and.push({
        parties: {
          some: {
            representations: {
              some: {
                attorney: {
                  OR: [{ firstName: term }, { lastName: term }],
                },
              },
            },
          },
        },
      });
    } else {
      and.push({
        OR: [
          { caseNumber: term },
          { title: term },
          { nextStep: term },
          { inquiry: { matterName: term } },
          {
            parties: {
              some: {
                OR: [
                  { firstName: term },
                  { lastName: term },
                  { organizationName: term },
                ],
              },
            },
          },
          {
            parties: {
              some: {
                representations: {
                  some: {
                    attorney: {
                      OR: [{ firstName: term }, { lastName: term }],
                    },
                  },
                },
              },
            },
          },
          {
            participants: {
              some: {
                role: "NEUTRAL",
                user: {
                  OR: [{ firstName: term }, { lastName: term }],
                },
              },
            },
          },
        ],
      });
    }
  }

  if (caseType) {
    where.caseType = caseType;
  }

  if (disputeCategoryId) {
    where.disputeCategoryId = disputeCategoryId;
  }

  if (lifecycleStatus) {
    where.lifecycleStatus = lifecycleStatus;
  }

  if (followUpDate) {
    const dayStart = new Date(followUpDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(followUpDate);
    dayEnd.setUTCHours(23, 59, 59, 999);
    where.followUpDate = { gte: dayStart, lte: dayEnd };
  }

  if (assignedNeutralId) {
    and.push({
      participants: {
        some: {
          userId: assignedNeutralId,
          role: "NEUTRAL",
          accessStatus: "ACTIVE",
        },
      },
    });
  }

  if (hearingDateFrom || hearingDateTo) {
    const hearingDateFilter = {};
    if (hearingDateFrom) hearingDateFilter.gte = new Date(hearingDateFrom);
    if (hearingDateTo) hearingDateFilter.lte = new Date(hearingDateTo);
    and.push({
      hearings: {
        some: {
          hearingStatus: { not: "CANCELLED" },
          hearingDate: hearingDateFilter,
        },
      },
    });
  }

  if (caseStatus) {
    const normalized = String(caseStatus).toLowerCase();
    if (normalized === "closed") {
      where.lifecycleStatus = "CLOSED";
    } else if (normalized === "inquiry") {
      and.push({
        lifecycleStatus: "INTAKE",
        inquiry: { is: { status: "INQUIRY" } },
      });
    } else if (normalized === "case" || normalized === "post-hearing") {
      and.push({
        lifecycleStatus: { in: ["INTAKE", "SCHEDULED", "ACTIVE", "ON_HOLD", "REOPENED"] },
      });
      if (normalized === "case") {
        and.push({
          OR: [
            { inquiry: null },
            { inquiry: { is: { status: { not: "INQUIRY" } } } },
            { lifecycleStatus: { not: "INTAKE" } },
          ],
        });
      }
    }
  }

  if (stageId) {
    where.stageId = stageId;
  } else if (stageName) {
    where.stage = { name: { equals: stageName, mode: "insensitive" } };
  }

  if (revenueStatus) {
    const statusMap = {
      estimated: "ESTIMATED",
      "total submitted": "INVOICED",
      totalsubmitted: "INVOICED",
      invoiced: "INVOICED",
      received: "RECEIVED",
    };
    const mapped =
      statusMap[String(revenueStatus).toLowerCase()] ||
      String(revenueStatus).toUpperCase();
    and.push({
      revenueMilestones: {
        some: { sequence: 1, status: mapped },
      },
    });
  }

  if (and.length) {
    where.AND = and;
  }

  const skip = (page - 1) * limit;
  const orderBy = { [sortBy]: sortOrder };

  const { cases, total } = await caseRepository.getCases({
    skip,
    take: limit,
    where,
    orderBy,
  });

  const totalPages = Math.ceil(total / limit) || 0;

  return {
    cases: cases.map(mapCase),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

const assertCaseNotClosed = (caseData) => {
  if (caseData.lifecycleStatus === "CLOSED") {
    throw new ApiError(400, "Closed cases are read-only.");
  }
};

const evaluateDerivedClosureStatus = async (caseId, label) => {
  switch (label) {
    case "Outcome Notes Added":
      return (
        (await prisma.caseNote.count({
          where: { caseId, noteType: "CASE_UPDATE" },
        })) > 0
      );
    case "Final Hearing Completed":
      return (
        (await prisma.hearing.count({
          where: { caseId, hearingStatus: "COMPLETED" },
        })) > 0
      );
    case "Required Documents Uploaded":
      return (
        (await prisma.document.count({
          where: { caseId, deletedAt: null },
        })) > 0
      );
    default:
      return null;
  }
};

const ensureClosureChecklist = async (caseId, tx = prisma) => {
  const existing = await tx.checklistItem.findMany({
    where: { caseId, category: "CLOSURE" },
    select: { id: true, label: true, status: true },
  });
  const existingLabels = new Set(existing.map((item) => item.label));
  const missingLabels = CLOSURE_CHECKLIST_LABELS.filter(
    (label) => !existingLabels.has(label),
  );

  if (missingLabels.length) {
    await tx.checklistItem.createMany({
      data: missingLabels.map((label) => ({
        caseId,
        category: "CLOSURE",
        label,
        type: "SYSTEM_DERIVED",
        status: "PENDING",
        relatedModule: "CASES",
      })),
    });
  }

  return tx.checklistItem.findMany({
    where: { caseId, category: "CLOSURE" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      status: true,
      type: true,
      completedAt: true,
      completedByUserId: true,
    },
  });
};

const syncDerivedClosureChecklist = async (caseId, tx = prisma) => {
  const items = await ensureClosureChecklist(caseId, tx);

  for (const item of items) {
    if (!CLOSURE_DERIVED_LABELS.has(item.label) || item.status === "COMPLETE") {
      continue;
    }

    const isComplete = await evaluateDerivedClosureStatus(caseId, item.label);

    if (isComplete) {
      await tx.checklistItem.update({
        where: { id: item.id },
        data: {
          status: "COMPLETE",
          completedAt: new Date(),
        },
      });
      item.status = "COMPLETE";
      item.completedAt = new Date();
    }
  }

  return items;
};

const getClosureChecklist = async (id, currentUser) => {
  const caseData = await getCaseById(id, currentUser);
  assertCaseNotClosed(caseData);

  const items = await syncDerivedClosureChecklist(id);
  const allComplete = items.every((item) => item.status === "COMPLETE");

  return {
    items,
    allComplete,
    canClose: allComplete,
  };
};

const writeCaseTimelineEvent = (
  tx,
  caseId,
  currentUser,
  eventType,
  summary,
  previousValue,
  newValue,
) =>
  tx.caseTimelineEvent.create({
    data: {
      caseId,
      eventType,
      relatedRecordType: "Case",
      relatedRecordId: caseId,
      summary,
      actorUserId: currentUser.id,
      previousValue: previousValue ? JSON.stringify(previousValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
    },
  });

const closeCase = async (id, data, currentUser) => {
  const existingCase = mapCase(await caseRepository.findCaseById(id));

  if (!existingCase) {
    throw new ApiError(404, "Case not found.");
  }

  await assertCaseAccess(existingCase, currentUser);

  if (!CLOSABLE_STATUSES.has(existingCase.lifecycleStatus)) {
    throw new ApiError(
      400,
      "Only active or reopened cases can be closed.",
    );
  }

  const closedAt = data.closeDate ? new Date(data.closeDate) : new Date();

  return prisma.$transaction(async (tx) => {
    const items = await syncDerivedClosureChecklist(id, tx);
    const incompleteItems = items.filter((item) => item.status !== "COMPLETE");

    if (incompleteItems.length) {
      throw new ApiError(
        400,
        "All closure checklist items must be completed before closing the case.",
      );
    }

    const updatedCase = await tx.case.update({
      where: { id },
      data: {
        lifecycleStatus: "CLOSED",
        closedAt,
        closureSummary: data.closureSummary,
        reopenReason: null,
      },
      select: caseRepository.CASE_SELECT,
    });

    await writeCaseTimelineEvent(
      tx,
      id,
      currentUser,
      "CASE_CLOSED",
      "Case closed.",
      {
        lifecycleStatus: existingCase.lifecycleStatus,
        closedAt: existingCase.closedAt,
      },
      {
        lifecycleStatus: "CLOSED",
        closedAt,
        closureSummary: data.closureSummary,
      },
    );

    return mapCase(updatedCase);
  });
};

const reopenCase = async (id, data, currentUser) => {
  const existingCase = mapCase(await caseRepository.findCaseById(id));

  if (!existingCase) {
    throw new ApiError(404, "Case not found.");
  }

  await assertCaseAccess(existingCase, currentUser);

  if (existingCase.lifecycleStatus !== "CLOSED") {
    throw new ApiError(400, "Only closed cases can be reopened.");
  }

  return prisma.$transaction(async (tx) => {
    const updatedCase = await tx.case.update({
      where: { id },
      data: {
        lifecycleStatus: "REOPENED",
        reopenReason: data.reopenReason,
        closedAt: null,
      },
      select: caseRepository.CASE_SELECT,
    });

    await writeCaseTimelineEvent(
      tx,
      id,
      currentUser,
      "CASE_REOPENED",
      `Case reopened: ${data.reopenReason}`,
      {
        lifecycleStatus: existingCase.lifecycleStatus,
        closedAt: existingCase.closedAt,
      },
      {
        lifecycleStatus: "REOPENED",
        reopenReason: data.reopenReason,
      },
    );

    return mapCase(updatedCase);
  });
};

const updateCase = async (id, data, currentUser) => {
  const existingCase = mapCase(await caseRepository.findCaseById(id));

  if (!existingCase) {
    throw new ApiError(404, "Case not found.");
  }

  await assertCaseAccess(existingCase, currentUser);
  assertCaseNotClosed(existingCase);

  const { caseManagerId, ...caseData } = data;

  if (caseManagerId) {
    await assertActiveCaseManager(caseManagerId);

    await caseRepository.setPrimaryCaseManager(id, caseManagerId);
  }

  if (Object.keys(caseData).length > 0) {
    await caseRepository.updateCase(id, caseData);
  }

  return mapCase(await caseRepository.findCaseById(id));
};

const updateCaseStatus = async (id, lifecycleStatus, currentUser, reason = null) => {
  const existingCase = mapCase(await caseRepository.findCaseById(id));

  if (!existingCase) {
    throw new ApiError(404, "Case not found.");
  }

  await assertCaseAccess(existingCase, currentUser);

  if (lifecycleStatus === "CLOSED") {
    if (!reason || !String(reason).trim()) {
      throw new ApiError(400, "reason is required when closing via status change.");
    }
    return closeCase(
      id,
      { closureSummary: String(reason).trim() },
      currentUser,
    );
  }

  if (lifecycleStatus === "REOPENED") {
    if (!reason || !String(reason).trim()) {
      throw new ApiError(400, "reason is required when reopening via status change.");
    }
    return reopenCase(
      id,
      { reopenReason: String(reason).trim() },
      currentUser,
    );
  }

  assertCaseNotClosed(existingCase);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.case.update({
      where: { id },
      data: { lifecycleStatus, isDraft: false },
      select: caseRepository.CASE_SELECT,
    });

    await writeCaseTimelineEvent(
      tx,
      id,
      currentUser,
      "STATUS_CHANGED",
      reason
        ? `Status changed to ${lifecycleStatus}: ${reason}`
        : `Status changed to ${lifecycleStatus}.`,
      { lifecycleStatus: existingCase.lifecycleStatus },
      { lifecycleStatus, reason: reason || null },
    );

    await notificationService.notifyCaseManagers(
      id,
      {
        eventType: "CASE_STATUS_CHANGED",
        subject: `Case status changed to ${lifecycleStatus}`,
        relatedRecordType: "Case",
        relatedRecordId: id,
        templateData: {
          title: "Case status updated",
          message: reason
            ? `Status is now ${lifecycleStatus}: ${reason}`
            : `Status is now ${lifecycleStatus}.`,
          kind: "CASE_STATUS_CHANGED",
          caseNumber: existingCase.caseNumber,
          caseTitle: existingCase.title,
          href: `/case-manager/cases/${id}`,
        },
      },
      { excludeUserId: currentUser.id, tx },
    );

    return mapCase(updated);
  });
};

const messageAllParties = async (caseId, payload, currentUser) => {
  const { sendEmail } = require("../utils/sendEmail");
  const existingCase = mapCase(await caseRepository.findCaseById(caseId));
  if (!existingCase) throw new ApiError(404, "Case not found.");
  await assertCaseAccess(existingCase, currentUser);

  const { recipientParticipantIds, subject, body } = payload;
  const participants = await prisma.caseParticipant.findMany({
    where: {
      caseId,
      id: { in: recipientParticipantIds },
      accessStatus: "ACTIVE",
    },
    select: {
      id: true,
      role: true,
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });

  if (!participants.length) {
    throw new ApiError(400, "No valid recipients found for this case.");
  }

  const missing = recipientParticipantIds.filter(
    (id) => !participants.some((p) => p.id === id),
  );
  if (missing.length) {
    throw new ApiError(400, `Invalid participant ids for this case: ${missing.join(", ")}`);
  }

  const sent = [];
  for (const participant of participants) {
    const email = participant.user?.email;
    if (!email) continue;
    await sendEmail(subject, body, email, "TEXT");
    sent.push({
      participantId: participant.id,
      email,
      role: participant.role,
    });
  }

  await prisma.caseTimelineEvent.create({
    data: {
      caseId,
      eventType: "MESSAGE_SENT",
      relatedRecordType: "Case",
      relatedRecordId: caseId,
      summary: `Message sent to ${sent.length} party(ies): ${subject}`,
      actorUserId: currentUser.id,
      newValue: JSON.stringify({
        subject,
        recipientParticipantIds,
        sentCount: sent.length,
      }),
    },
  });

  return {
    caseId,
    subject,
    sent,
    sentCount: sent.length,
  };
};

const buildCaseManagerScope = (currentUser) => {
  if (hasGlobalCaseAccess(currentUser.role?.name)) {
    return {};
  }

  if (currentUser.role?.name !== "CASE_MANAGER") {
    return {};
  }

  return {
    participants: {
      some: {
        userId: currentUser.id,
        role: "CASE_MANAGER",
        accessStatus: "ACTIVE",
      },
    },
  };
};

module.exports = {
  createCase,
  getCases,
  getCaseById,
  updateCase,
  updateCaseStatus,
  getClosureChecklist,
  closeCase,
  reopenCase,
  messageAllParties,
  mapCase,
  generateCaseNumber,
  assertActiveCaseManager,
  hasGlobalCaseAccess,
  buildCaseManagerScope,
};
