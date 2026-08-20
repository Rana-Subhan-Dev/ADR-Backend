const prisma = require("../config/prisma");
const caseNoteRepository = require("../repositories/caseNote.repository");
const caseService = require("./case.service");
const ApiError = require("../utils/apiError");

const managerRoles = ["SUPER_ADMIN", "ADMIN_LEADERSHIP", "CASE_MANAGER"];

const assertSupportedVisibility = (visibility) => {
  if (visibility === "SPECIFIC_PARTICIPANTS")
    throw new ApiError(
      400,
      "Specific participant visibility is not supported by the current case note schema.",
    );
};

const assertNoteAccess = async (caseId, noteId, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const note = await caseNoteRepository.findCaseNoteById(noteId);
  if (!note || note.caseId !== caseId)
    throw new ApiError(404, "Case note not found.");
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

const createCaseNote = async (caseId, data, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const visibility = data.visibility || "INTERNAL_ONLY";
  assertSupportedVisibility(visibility);
  if (data.noteType === "INTERNAL_NOTE" && visibility !== "INTERNAL_ONLY")
    throw new ApiError(
      400,
      "Internal notes must use internal-only visibility.",
    );
  return prisma.$transaction(async (tx) => {
    const note = await caseNoteRepository.createCaseNote(
      { ...data, caseId, authorUserId: currentUser.id, visibility },
      tx,
    );
    await writeAuditLog(tx, currentUser, "CREATE", note, null, {
      noteType: note.noteType,
      visibility: note.visibility,
      body: note.body,
    });
    return note;
  });
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
  };
  const [notes, total] = await caseNoteRepository.getCaseNotes({
    where,
    skip: (page - 1) * limit,
    take: limit,
  });
  const totalPages = Math.ceil(total / limit);
  return {
    notes,
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

const getCaseNote = (caseId, noteId, currentUser) =>
  assertNoteAccess(caseId, noteId, currentUser);

const updateCaseNote = async (caseId, noteId, data, currentUser) => {
  const note = await assertNoteAccess(caseId, noteId, currentUser);
  assertCanManage(note, currentUser);
  const visibility = data.visibility || note.visibility;
  assertSupportedVisibility(visibility);
  if (note.noteType === "INTERNAL_NOTE" && visibility !== "INTERNAL_ONLY")
    throw new ApiError(
      400,
      "Internal notes must use internal-only visibility.",
    );
  return prisma.$transaction(async (tx) => {
    const updated = await caseNoteRepository.updateCaseNote(
      noteId,
      { ...data, visibility },
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
      },
      {
        visibility: updated.visibility,
        body: updated.body,
      },
    );
    return updated;
  });
};

const deleteCaseNote = async (caseId, noteId, currentUser) => {
  const note = await assertNoteAccess(caseId, noteId, currentUser);
  assertCanManage(note, currentUser);
  return prisma.$transaction(async (tx) => {
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
  });
};

module.exports = {
  createCaseNote,
  getCaseNotes,
  getCaseNote,
  updateCaseNote,
  deleteCaseNote,
};
