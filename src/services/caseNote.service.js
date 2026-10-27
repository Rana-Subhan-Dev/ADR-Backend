const prisma = require("../config/prisma");
const caseNoteRepository = require("../repositories/caseNote.repository");
const caseService = require("./case.service");
const notificationService = require("./notification.service");
const ApiError = require("../utils/apiError");
const {
  RELATED_RECORD_TYPES,
} = require("../validations/caseNote.validation");

const managerRoles = ["SUPER_ADMIN", "ADMIN_LEADERSHIP", "CASE_MANAGER"];
const isInternal = (user) => managerRoles.includes(user.role?.name);

const roleDisplayLabel = (roleName) => {
  if (!roleName) return null;
  const map = {
    SUPER_ADMIN: "Super Admin",
    ADMIN_LEADERSHIP: "Admin",
    CASE_MANAGER: "Case Manager",
    LAWYER: "Attorney",
    NEUTRAL: "Neutral",
    CLIENT: "Client",
  };
  return map[roleName] || String(roleName).replace(/_/g, " ");
};

const mapAuthor = (author) => {
  if (!author) return null;
  const roleName = author.role?.name || null;
  const firmName = author.attorneyProfile?.lawFirm?.name || null;
  return {
    id: author.id,
    firstName: author.firstName,
    lastName: author.lastName,
    email: author.email,
    role: roleName,
    roleLabel: roleDisplayLabel(roleName),
    jobTitle: author.jobTitle || null,
    company: author.company || null,
    entityName: firmName || author.company || null,
  };
};

const assertSupportedVisibility = (visibility) => {
  if (visibility === "SPECIFIC_PARTICIPANTS")
    throw new ApiError(
      400,
      "Specific participant visibility is not supported by the current case note schema.",
    );
};

const assertRelatedRecord = async (caseId, relatedRecordType, relatedRecordId) => {
  if (!relatedRecordType && !relatedRecordId) return null;
  if (!relatedRecordType || !relatedRecordId) {
    throw new ApiError(
      400,
      "relatedRecordType and relatedRecordId must be provided together.",
    );
  }
  if (!RELATED_RECORD_TYPES.includes(relatedRecordType)) {
    throw new ApiError(
      400,
      `relatedRecordType must be one of: ${RELATED_RECORD_TYPES.join(", ")}.`,
    );
  }
  if (relatedRecordType === "Document") {
    const doc = await prisma.document.findFirst({
      where: { id: relatedRecordId, caseId },
      select: { id: true },
    });
    if (!doc) throw new ApiError(404, "Related document not found on this case.");
    return { relatedRecordType, relatedRecordId };
  }
  const hearing = await prisma.hearing.findFirst({
    where: { id: relatedRecordId, caseId },
    select: { id: true },
  });
  if (!hearing) throw new ApiError(404, "Related hearing not found on this case.");
  return { relatedRecordType, relatedRecordId };
};

const loadRelatedSummaries = async (notes) => {
  const docIds = [
    ...new Set(
      notes
        .filter((n) => n.relatedRecordType === "Document" && n.relatedRecordId)
        .map((n) => n.relatedRecordId),
    ),
  ];
  const hearingIds = [
    ...new Set(
      notes
        .filter((n) => n.relatedRecordType === "Hearing" && n.relatedRecordId)
        .map((n) => n.relatedRecordId),
    ),
  ];
  const [documents, hearings] = await Promise.all([
    docIds.length
      ? prisma.document.findMany({
          where: { id: { in: docIds } },
          select: {
            id: true,
            name: true,
            createdAt: true,
            category: { select: { name: true } },
          },
        })
      : [],
    hearingIds.length
      ? prisma.hearing.findMany({
          where: { id: { in: hearingIds } },
          select: {
            id: true,
            title: true,
            hearingDate: true,
            createdAt: true,
            type: true,
          },
        })
      : [],
  ]);
  const docMap = Object.fromEntries(documents.map((d) => [d.id, d]));
  const hearingMap = Object.fromEntries(hearings.map((h) => [h.id, h]));
  return { docMap, hearingMap };
};

const mapRelatedTo = (note, docMap, hearingMap) => {
  if (!note.relatedRecordType || !note.relatedRecordId) return null;
  if (note.relatedRecordType === "Document") {
    const doc = docMap[note.relatedRecordId];
    if (!doc) {
      return {
        type: "Document",
        id: note.relatedRecordId,
        label: "Document",
        title: null,
        date: null,
      };
    }
    return {
      type: "Document",
      id: doc.id,
      label: "Document",
      title: doc.name,
      category: doc.category?.name || null,
      date: doc.createdAt,
    };
  }
  if (note.relatedRecordType === "Hearing") {
    const hearing = hearingMap[note.relatedRecordId];
    if (!hearing) {
      return {
        type: "Hearing",
        id: note.relatedRecordId,
        label: "Hearing",
        title: null,
        date: null,
      };
    }
    return {
      type: "Hearing",
      id: hearing.id,
      label: "Hearing",
      title: hearing.title,
      hearingType: hearing.type || null,
      date: hearing.hearingDate || hearing.createdAt,
    };
  }
  return {
    type: note.relatedRecordType,
    id: note.relatedRecordId,
    label: note.relatedRecordType,
    title: null,
    date: null,
  };
};

const enrichNotes = async (notes) => {
  if (!notes?.length) return [];
  const { docMap, hearingMap } = await loadRelatedSummaries(notes);
  return notes.map((note) => ({
    id: note.id,
    caseId: note.caseId,
    noteType: note.noteType,
    visibility: note.visibility,
    body: note.body,
    relatedRecordType: note.relatedRecordType || null,
    relatedRecordId: note.relatedRecordId || null,
    relatedTo: mapRelatedTo(note, docMap, hearingMap),
    parentNoteId: note.parentNoteId || null,
    authorUserId: note.authorUserId,
    author: mapAuthor(note.author),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }));
};

const enrichNote = async (note) => {
  const [enriched] = await enrichNotes([note]);
  return enriched;
};

const assertNoteAccess = async (caseId, noteId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const note = await caseNoteRepository.findCaseNoteById(noteId);
  if (!note || note.caseId !== caseId)
    throw new ApiError(404, "Case note not found.");
  if (
    !isInternal(currentUser) &&
    (note.visibility !== "ALL_PARTICIPANTS" ||
      note.noteType === "INTERNAL_NOTE")
  ) {
    throw new ApiError(403, "You do not have access to this case note.");
  }
  return note;
};

const assertCanManage = (note, currentUser) => {
  if (
    note.authorUserId !== currentUser.id &&
    !managerRoles.includes(currentUser.role?.name)
  )
    throw new ApiError(
      403,
      "You do not have permission to modify this case note.",
    );
};

const writeAuditLog = (
  tx,
  currentUser,
  action,
  note,
  previousValue,
  newValue,
) =>
  tx.auditLog.create({
    data: {
      actingUserId: currentUser.id,
      actingUserRoleSnapshot: currentUser.role?.name || null,
      action,
      module: "CASES",
      affectedRecordType: "CaseNote",
      affectedRecordId: note.id,
      previousValue,
      newValue,
    },
  });

const timelineSummaryFor = (note) => {
  if (note.parentNoteId) return "Reply posted on external comment.";
  if (note.noteType === "CASE_UPDATE") return "Case update posted.";
  if (note.noteType === "EXTERNAL_COMMENT") return "External comment added.";
  return "Case note added.";
};

const maybeWriteTimeline = async (tx, caseId, note, currentUser) => {
  if (note.noteType === "INTERNAL_NOTE") return;
  if (note.visibility !== "ALL_PARTICIPANTS") return;
  await tx.caseTimelineEvent.create({
    data: {
      caseId,
      eventType: "MESSAGE_SENT",
      relatedRecordType: "CaseNote",
      relatedRecordId: note.id,
      summary: timelineSummaryFor(note),
      actorUserId: currentUser.id,
    },
  });
};

const createCaseNote = async (caseId, data, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const visibility = data.visibility || "INTERNAL_ONLY";
  assertSupportedVisibility(visibility);
  if (!isInternal(currentUser)) {
    if (
      data.noteType !== "EXTERNAL_COMMENT" ||
      visibility !== "ALL_PARTICIPANTS"
    ) {
      throw new ApiError(
        403,
        "External users may only create shared external comments.",
      );
    }
  }
  if (data.noteType === "INTERNAL_NOTE" && visibility !== "INTERNAL_ONLY")
    throw new ApiError(
      400,
      "Internal notes must use internal-only visibility.",
    );
  const related = await assertRelatedRecord(
    caseId,
    data.relatedRecordType,
    data.relatedRecordId,
  );
  return prisma.$transaction(async (tx) => {
    const note = await caseNoteRepository.createCaseNote(
      {
        noteType: data.noteType,
        visibility,
        body: data.body,
        caseId,
        authorUserId: currentUser.id,
        relatedRecordType: related?.relatedRecordType || null,
        relatedRecordId: related?.relatedRecordId || null,
      },
      tx,
    );
    await writeAuditLog(tx, currentUser, "CREATE", note, null, {
      noteType: note.noteType,
      visibility: note.visibility,
      body: note.body,
      relatedRecordType: note.relatedRecordType,
      relatedRecordId: note.relatedRecordId,
    });
    await maybeWriteTimeline(tx, caseId, note, currentUser);
    return note;
  }).then(enrichNote);
};

const getCaseNotes = async (caseId, query, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  assertSupportedVisibility(query.visibility);
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const where = {
    caseId,
    ...(query.noteType && { noteType: query.noteType }),
    ...(query.visibility && { visibility: query.visibility }),
    ...(query.authorUserId && { authorUserId: query.authorUserId }),
    ...(query.relatedRecordType && {
      relatedRecordType: query.relatedRecordType,
    }),
  };

  // Root notes only by default; pass parentNoteId or includeReplies=true for threads.
  if (query.parentNoteId) {
    where.parentNoteId = query.parentNoteId;
  } else if (!query.includeReplies) {
    where.parentNoteId = null;
  }

  if (!isInternal(currentUser)) {
    where.visibility = "ALL_PARTICIPANTS";
    if (query.noteType === "INTERNAL_NOTE") {
      throw new ApiError(403, "You do not have access to internal notes.");
    }
    if (query.noteType) {
      where.noteType = query.noteType;
    } else {
      where.noteType = { in: ["CASE_UPDATE", "EXTERNAL_COMMENT"] };
    }
  }

  const [notes, total] = await caseNoteRepository.getCaseNotes({
    where,
    skip: (page - 1) * limit,
    take: limit,
  });
  const totalPages = Math.ceil(total / limit);
  return {
    notes: await enrichNotes(notes),
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

const getCaseNote = async (caseId, noteId, currentUser) =>
  enrichNote(await assertNoteAccess(caseId, noteId, currentUser));

const updateCaseNote = async (caseId, noteId, data, currentUser) => {
  const note = await assertNoteAccess(caseId, noteId, currentUser);
  if (!isInternal(currentUser) && note.authorUserId !== currentUser.id)
    throw new ApiError(
      403,
      "You do not have permission to modify this case note.",
    );
  assertCanManage(note, currentUser);
  const visibility = data.visibility || note.visibility;
  if (!isInternal(currentUser) && visibility !== "ALL_PARTICIPANTS")
    throw new ApiError(
      403,
      "External comments must remain shared with participants.",
    );
  assertSupportedVisibility(visibility);
  if (note.noteType === "INTERNAL_NOTE" && visibility !== "INTERNAL_ONLY")
    throw new ApiError(
      400,
      "Internal notes must use internal-only visibility.",
    );

  let relatedPatch = {};
  if (
    data.relatedRecordType !== undefined ||
    data.relatedRecordId !== undefined
  ) {
    if (data.relatedRecordType === null || data.relatedRecordId === null) {
      relatedPatch = { relatedRecordType: null, relatedRecordId: null };
    } else {
      const related = await assertRelatedRecord(
        caseId,
        data.relatedRecordType ?? note.relatedRecordType,
        data.relatedRecordId ?? note.relatedRecordId,
      );
      relatedPatch = {
        relatedRecordType: related?.relatedRecordType || null,
        relatedRecordId: related?.relatedRecordId || null,
      };
    }
  }

  return prisma
    .$transaction(async (tx) => {
      const updated = await caseNoteRepository.updateCaseNote(
        noteId,
        {
          ...(data.body !== undefined && { body: data.body }),
          visibility,
          ...relatedPatch,
        },
        tx,
      );
      await writeAuditLog(
        tx,
        currentUser,
        "EDIT",
        updated,
        {
          visibility: note.visibility,
          body: note.body,
          relatedRecordType: note.relatedRecordType,
          relatedRecordId: note.relatedRecordId,
        },
        {
          visibility: updated.visibility,
          body: updated.body,
          relatedRecordType: updated.relatedRecordType,
          relatedRecordId: updated.relatedRecordId,
        },
      );
      return updated;
    })
    .then(enrichNote);
};

const deleteCaseNote = async (caseId, noteId, currentUser) => {
  const note = await assertNoteAccess(caseId, noteId, currentUser);
  assertCanManage(note, currentUser);
  return prisma
    .$transaction(async (tx) => {
      const deleted = await caseNoteRepository.deleteCaseNote(noteId, tx);
      await writeAuditLog(
        tx,
        currentUser,
        "DELETE",
        deleted,
        {
          noteType: deleted.noteType,
          visibility: deleted.visibility,
          body: deleted.body,
        },
        null,
      );
      return deleted;
    })
    .then(enrichNote);
};

const replyToCaseNote = async (caseId, noteId, data, currentUser) => {
  const parent = await assertNoteAccess(caseId, noteId, currentUser);
  if (parent.noteType !== "EXTERNAL_COMMENT") {
    throw new ApiError(400, "Replies are only supported on external comments.");
  }
  if (parent.parentNoteId) {
    throw new ApiError(400, "Cannot reply to a reply; reply to the root comment.");
  }

  const alsoPostAsCaseUpdate = Boolean(data.alsoPostAsCaseUpdate);
  const updateVisibility = data.visibility || "ALL_PARTICIPANTS";
  if (alsoPostAsCaseUpdate) {
    assertSupportedVisibility(updateVisibility);
    if (!isInternal(currentUser) && updateVisibility !== "ALL_PARTICIPANTS") {
      throw new ApiError(
        403,
        "External users may only post shared case updates.",
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const reply = await caseNoteRepository.createCaseNote(
      {
        caseId,
        authorUserId: currentUser.id,
        noteType: "EXTERNAL_COMMENT",
        visibility: "ALL_PARTICIPANTS",
        body: data.body,
        parentNoteId: parent.id,
        relatedRecordType: parent.relatedRecordType || null,
        relatedRecordId: parent.relatedRecordId || null,
      },
      tx,
    );
    await writeAuditLog(tx, currentUser, "CREATE", reply, null, {
      noteType: reply.noteType,
      visibility: reply.visibility,
      body: reply.body,
      parentNoteId: reply.parentNoteId,
    });
    await maybeWriteTimeline(tx, caseId, reply, currentUser);

    let caseUpdate = null;
    if (alsoPostAsCaseUpdate) {
      caseUpdate = await caseNoteRepository.createCaseNote(
        {
          caseId,
          authorUserId: currentUser.id,
          noteType: "CASE_UPDATE",
          visibility: updateVisibility,
          body: data.body,
          relatedRecordType: parent.relatedRecordType || null,
          relatedRecordId: parent.relatedRecordId || null,
        },
        tx,
      );
      await writeAuditLog(tx, currentUser, "CREATE", caseUpdate, null, {
        noteType: caseUpdate.noteType,
        visibility: caseUpdate.visibility,
        body: caseUpdate.body,
        fromReplyToNoteId: parent.id,
      });
      await maybeWriteTimeline(tx, caseId, caseUpdate, currentUser);
    }

    if (parent.authorUserId && parent.authorUserId !== currentUser.id) {
      await notificationService.createInAppNotification(
        {
          recipientUserId: parent.authorUserId,
          eventType: "CASE_NOTE_REPLY",
          subject: "Reply to your case comment",
          templateData: {
            title: "Reply to your comment",
            message: data.body.slice(0, 280),
            caseId,
            parentNoteId: parent.id,
            replyNoteId: reply.id,
          },
          relatedRecordType: "CaseNote",
          relatedRecordId: reply.id,
        },
        tx,
      );
    }

    return { reply, caseUpdate };
  });

  return {
    reply: await enrichNote(result.reply),
    caseUpdate: result.caseUpdate ? await enrichNote(result.caseUpdate) : null,
  };
};

module.exports = {
  createCaseNote,
  getCaseNotes,
  getCaseNote,
  updateCaseNote,
  deleteCaseNote,
  replyToCaseNote,
};
