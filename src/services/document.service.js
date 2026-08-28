const prisma = require("../config/prisma");
const documentRepository = require("../repositories/document.repository");
const caseService = require("./case.service");
const storageProvider = require("../storage/storage.factory");
const ApiError = require("../utils/apiError");

const managerRoles = ["SUPER_ADMIN", "ADMIN_LEADERSHIP", "CASE_MANAGER"];

const isManager = (user) => managerRoles.includes(user.role?.name);

const assertCanSetVisibility = (visibility, currentUser) => {
  if (!isManager(currentUser) && visibility !== "ALL_AUTHORIZED_PARTICIPANTS") {
    throw new ApiError(
      403,
      "External users may only upload documents for authorized case participants.",
    );
  }
};

const assertRecipients = async (
  caseId,
  visibility,
  recipientParticipantIds,
  tx,
) => {
  if (
    visibility === "SPECIFIC_PARTY_LAWYER_CLIENT" &&
    !recipientParticipantIds.length
  )
    throw new ApiError(
      400,
      "Specific visibility requires at least one recipient.",
    );
  if (
    visibility !== "SPECIFIC_PARTY_LAWYER_CLIENT" &&
    recipientParticipantIds.length
  )
    throw new ApiError(
      400,
      "Recipients are only allowed for specific visibility.",
    );
  if (!recipientParticipantIds.length) return;
  const participants = await documentRepository.findParticipants(
    caseId,
    recipientParticipantIds,
    tx,
  );
  if (participants.length !== recipientParticipantIds.length)
    throw new ApiError(
      400,
      "One or more recipients are not active case participants.",
    );
};

const assertCategory = async (categoryId, tx) => {
  if (!categoryId) return;
  const category = await tx.documentCategory.findFirst({
    where: { id: categoryId, isActive: true },
    select: { id: true },
  });
  if (!category)
    throw new ApiError(400, "Document category not found or inactive.");
};

const writeAudit = (
  tx,
  currentUser,
  action,
  document,
  previousValue,
  newValue,
  reason,
) =>
  tx.auditLog.create({
    data: {
      actingUserId: currentUser.id,
      actingUserRoleSnapshot: currentUser.role?.name || null,
      action,
      module: "DOCUMENTS",
      affectedRecordType: "Document",
      affectedRecordId: document.id,
      previousValue,
      newValue,
      reason: reason || null,
    },
  });

const writeTimeline = (
  tx,
  caseId,
  document,
  eventType,
  summary,
  currentUser,
  previousValue,
  newValue,
) =>
  tx.caseTimelineEvent.create({
    data: {
      caseId,
      eventType,
      relatedRecordType: "Document",
      relatedRecordId: document.id,
      summary,
      actorUserId: currentUser.id,
      previousValue: previousValue ? JSON.stringify(previousValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
    },
  });

const hasDocumentAccess = async (document, currentUser) => {
  if (isManager(currentUser) || document.uploadedByUserId === currentUser.id)
    return true;
  if (
    document.visibility === "ACCOUNTING_FINANCE" &&
    currentUser.role?.name === "ACCOUNTING_STAFF"
  )
    return true;
  const participant = await prisma.caseParticipant.findFirst({
    where: {
      caseId: document.caseId,
      userId: currentUser.id,
      accessStatus: "ACTIVE",
    },
    select: { id: true, role: true },
  });
  if (!participant || document.visibility === "INTERNAL_ONLY") return false;
  if (document.visibility === "ALL_AUTHORIZED_PARTICIPANTS") return true;
  if (document.visibility === "NEUTRAL_ONLY")
    return participant.role === "NEUTRAL";
  return document.accessGrants.some(
    (grant) => grant.caseParticipantId === participant.id,
  );
};

const getAuthorizedDocument = async (
  caseId,
  documentId,
  currentUser,
  requireAccess = true,
) => {
  await caseService.getCaseById(caseId, currentUser);
  const document = await documentRepository.findDocumentById(documentId);
  if (!document || document.caseId !== caseId || document.deletedAt)
    throw new ApiError(404, "Document not found.");
  if (requireAccess && !(await hasDocumentAccess(document, currentUser)))
    throw new ApiError(403, "You do not have access to this document.");
  return document;
};

const uploadDocument = async (caseId, data, file, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  assertCanSetVisibility(data.visibility, currentUser);
  if (!file) throw new ApiError(400, "A document file is required.");
  const storedFile = await storageProvider.uploadFile(file);
  try {
    return await prisma.$transaction(
      async (tx) => {
        await assertCategory(data.categoryId, tx);
        await assertRecipients(
          caseId,
          data.visibility,
          data.recipientParticipantIds,
          tx,
        );
        const document = await documentRepository.createDocument(
          {
            caseId,
            name: data.name || file.originalname,
            description: data.description || null,
            categoryId: data.categoryId || null,
            visibility: data.visibility,
            reviewStatus: "PENDING_REVIEW",
            processingStatus: "COMPLETED",
            uploadedByUserId: currentUser.id,
            tags: {
              connectOrCreate: data.tags.map((name) => ({
                where: { name },
                create: { name, isCustom: true },
              })),
            },
            ...(data.recipientParticipantIds.length && {
              accessGrants: {
                create: data.recipientParticipantIds.map(
                  (caseParticipantId) => ({
                    caseParticipantId,
                    grantedByUserId: currentUser.id,
                  }),
                ),
              },
            }),
          },
          tx,
        );
        const version = await documentRepository.createVersion(
          {
            documentId: document.id,
            versionNumber: 1,
            fileKey: storedFile.key,
            fileSizeBytes: file.size,
            mimeType: file.mimetype,
            uploadedByUserId: currentUser.id,
            notifyParticipants: data.notifyParticipants,
          },
          tx,
        );
        const updated = await documentRepository.updateDocument(
          document.id,
          { currentVersionId: version.id },
          tx,
        );
        await writeTimeline(
          tx,
          caseId,
          updated,
          "DOCUMENT_UPLOADED",
          `${updated.name} uploaded.`,
          currentUser,
          null,
          { version: 1, visibility: updated.visibility },
        );
        await writeAudit(tx, currentUser, "CREATE", updated, null, {
          version: 1,
          visibility: updated.visibility,
          fileKey: version.fileKey,
        });
        return updated;
      },
      { timeout: 15000 },
    );
  } catch (error) {
    await storageProvider.deleteFile(storedFile.key).catch(() => undefined);
    throw error;
  }
};

const bulkUploadDocuments = async (caseId, data, files, currentUser) => {
  if (!files?.length)
    throw new ApiError(400, "At least one document file is required.");
  const uploaded = [];
  try {
    for (const file of files)
      uploaded.push({ file, ...(await storageProvider.uploadFile(file)) });
    await caseService.getCaseById(caseId, currentUser);
    return await prisma.$transaction(
      async (tx) => {
        await assertCategory(data.categoryId, tx);
        await assertRecipients(
          caseId,
          data.visibility,
          data.recipientParticipantIds,
          tx,
        );
        const documents = [];
        for (const stored of uploaded) {
          const document = await documentRepository.createDocument(
            {
              caseId,
              name: stored.file.originalname,
              description: data.description || null,
              categoryId: data.categoryId || null,
              visibility: data.visibility,
              reviewStatus: "PENDING_REVIEW",
              processingStatus: "COMPLETED",
              uploadedByUserId: currentUser.id,
              tags: {
                connectOrCreate: data.tags.map((name) => ({
                  where: { name },
                  create: { name, isCustom: true },
                })),
              },
              ...(data.recipientParticipantIds.length && {
                accessGrants: {
                  create: data.recipientParticipantIds.map(
                    (caseParticipantId) => ({
                      caseParticipantId,
                      grantedByUserId: currentUser.id,
                    }),
                  ),
                },
              }),
            },
            tx,
          );
          const version = await documentRepository.createVersion(
            {
              documentId: document.id,
              versionNumber: 1,
              fileKey: stored.key,
              fileSizeBytes: stored.file.size,
              mimeType: stored.file.mimetype,
              uploadedByUserId: currentUser.id,
              notifyParticipants: data.notifyParticipants,
            },
            tx,
          );
          const updated = await documentRepository.updateDocument(
            document.id,
            { currentVersionId: version.id },
            tx,
          );
          await writeTimeline(
            tx,
            caseId,
            updated,
            "DOCUMENT_UPLOADED",
            `${updated.name} uploaded.`,
            currentUser,
            null,
            { version: 1, visibility: updated.visibility },
          );
          await writeAudit(tx, currentUser, "CREATE", updated, null, {
            version: 1,
            visibility: updated.visibility,
            fileKey: version.fileKey,
          });
          documents.push(updated);
        }
        return documents;
      },
      { timeout: 30000 },
    );
  } catch (error) {
    await Promise.all(
      uploaded.map(({ key }) =>
        storageProvider.deleteFile(key).catch(() => undefined),
      ),
    );
    throw error;
  }
};

const getDocuments = async (caseId, query, currentUser) => {
  await caseService.getCaseById(caseId, currentUser);
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const where = {
    caseId,
    deletedAt: null,
    ...(query.categoryId && { categoryId: query.categoryId }),
    ...(query.visibility && { visibility: query.visibility }),
    ...(query.reviewStatus && { reviewStatus: query.reviewStatus }),
    ...(query.search && {
      name: { contains: query.search, mode: "insensitive" },
    }),
  };
  if (!isManager(currentUser)) {
    where.OR = [
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
            caseParticipant: { userId: currentUser.id, accessStatus: "ACTIVE" },
          },
        },
      },
      ...(currentUser.role?.name === "ACCOUNTING_STAFF"
        ? [{ visibility: "ACCOUNTING_FINANCE" }]
        : []),
    ];
  }
  const [documents, total] = await documentRepository.getDocuments({
    where,
    skip: (page - 1) * limit,
    take: limit,
  });
  const totalPages = Math.ceil(total / limit);
  return {
    documents,
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

const getDocument = async (caseId, documentId, currentUser) => {
  const document = await getAuthorizedDocument(caseId, documentId, currentUser);
  await prisma.documentAccessLog.create({
    data: { documentId, accessedByUserId: currentUser.id, action: "VIEWED" },
  });
  return document;
};

const uploadNewVersion = async (
  caseId,
  documentId,
  data,
  file,
  currentUser,
) => {
  const document = await getAuthorizedDocument(caseId, documentId, currentUser);
  if (!isManager(currentUser) && document.uploadedByUserId !== currentUser.id)
    throw new ApiError(
      403,
      "You do not have permission to upload a new version.",
    );
  if (!file) throw new ApiError(400, "A document file is required.");
  const storedFile = await storageProvider.uploadFile(file);
  try {
    return await prisma.$transaction(async (tx) => {
      const latest = await tx.documentVersion.aggregate({
        where: { documentId },
        _max: { versionNumber: true },
      });
      const version = await documentRepository.createVersion(
        {
          documentId,
          versionNumber: (latest._max.versionNumber || 0) + 1,
          fileKey: storedFile.key,
          fileSizeBytes: file.size,
          mimeType: file.mimetype,
          changesNotes: data.changesNotes || null,
          uploadedByUserId: currentUser.id,
          isNewVersionOfExisting: true,
          notifyParticipants: data.notifyParticipants,
        },
        tx,
      );
      const updated = await documentRepository.updateDocument(
        documentId,
        { currentVersionId: version.id, processingStatus: "COMPLETED" },
        tx,
      );
      await writeTimeline(
        tx,
        caseId,
        updated,
        "DOCUMENT_UPLOADED",
        `${updated.name} version ${version.versionNumber} uploaded.`,
        currentUser,
        { version: document.currentVersion?.versionNumber },
        { version: version.versionNumber },
      );
      await writeAudit(
        tx,
        currentUser,
        "EDIT",
        updated,
        { currentVersionId: document.currentVersionId },
        { currentVersionId: version.id, versionNumber: version.versionNumber },
      );
      return updated;
    });
  } catch (error) {
    await storageProvider.deleteFile(storedFile.key).catch(() => undefined);
    throw error;
  }
};

const updateVisibility = async (caseId, documentId, data, currentUser) => {
  const document = await getAuthorizedDocument(caseId, documentId, currentUser);
  if (!isManager(currentUser) && document.uploadedByUserId !== currentUser.id)
    throw new ApiError(403, "You do not have permission to change visibility.");
  assertCanSetVisibility(data.visibility, currentUser);
  return prisma.$transaction(async (tx) => {
    await assertRecipients(
      caseId,
      data.visibility,
      data.recipientParticipantIds,
      tx,
    );
    const updated = await documentRepository.updateDocument(
      documentId,
      {
        visibility: data.visibility,
        accessGrants: {
          deleteMany: {},
          ...(data.recipientParticipantIds.length && {
            create: data.recipientParticipantIds.map((caseParticipantId) => ({
              caseParticipantId,
              grantedByUserId: currentUser.id,
            })),
          }),
        },
      },
      tx,
    );
    await writeTimeline(
      tx,
      caseId,
      updated,
      "DOCUMENT_VISIBILITY_CHANGED",
      `${updated.name} visibility changed.`,
      currentUser,
      { visibility: document.visibility },
      { visibility: updated.visibility },
    );
    await writeAudit(
      tx,
      currentUser,
      "EDIT",
      updated,
      { visibility: document.visibility },
      {
        visibility: updated.visibility,
        recipients: data.recipientParticipantIds,
      },
      data.reason,
    );
    return updated;
  });
};

const softDeleteDocument = async (caseId, documentId, reason, currentUser) => {
  const document = await getAuthorizedDocument(caseId, documentId, currentUser);
  if (!isManager(currentUser) && document.uploadedByUserId !== currentUser.id)
    throw new ApiError(
      403,
      "You do not have permission to delete this document.",
    );
  return prisma.$transaction(async (tx) => {
    const updated = await documentRepository.updateDocument(
      documentId,
      { deletedAt: new Date() },
      tx,
    );
    await writeAudit(
      tx,
      currentUser,
      "DELETE",
      updated,
      { deletedAt: null },
      { deletedAt: updated.deletedAt },
      reason,
    );
    return updated;
  });
};

const getDocumentVersions = async (caseId, documentId, currentUser) => {
  await getAuthorizedDocument(caseId, documentId, currentUser);
  return documentRepository.getVersions(documentId);
};

const downloadDocument = async (caseId, documentId, currentUser) => {
  const document = await getAuthorizedDocument(caseId, documentId, currentUser);
  if (!document.currentVersion)
    throw new ApiError(404, "Document version not found.");
  const stream = await storageProvider.getReadStream(
    document.currentVersion.fileKey,
  );
  await prisma.documentAccessLog.create({
    data: {
      documentId,
      accessedByUserId: currentUser.id,
      action: "DOWNLOADED",
    },
  });
  return {
    stream,
    name: document.name,
    mimeType: document.currentVersion.mimeType,
  };
};

const getDocumentAccessLogs = async (
  caseId,
  documentId,
  query,
  currentUser,
) => {
  const document = await getAuthorizedDocument(caseId, documentId, currentUser);
  if (!isManager(currentUser) && document.uploadedByUserId !== currentUser.id)
    throw new ApiError(403, "You do not have permission to view access logs.");
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const [accessLogs, total] = await documentRepository.getAccessLogs(
    documentId,
    (page - 1) * limit,
    limit,
  );
  return {
    accessLogs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

module.exports = {
  uploadDocument,
  bulkUploadDocuments,
  getDocuments,
  getDocument,
  uploadNewVersion,
  updateVisibility,
  softDeleteDocument,
  getDocumentVersions,
  downloadDocument,
  getDocumentAccessLogs,
};
