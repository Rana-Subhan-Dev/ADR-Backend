const documentService = require("../services/document.service");
const ApiResponse = require("../utils/apiResponse");
const ApiError = require("../utils/apiError");
const asyncHandler = require("../utils/asyncHandler");

const normalizeArray = (value, field) => {
  if (value === undefined || value === "") return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new ApiError(400, `${field} must be a JSON array.`);
  }
};

const normalizeUploadBody = (body) => ({
  ...body,
  tags: normalizeArray(body.tags, "tags"),
  recipientParticipantIds: normalizeArray(
    body.recipientParticipantIds,
    "recipientParticipantIds",
  ),
});

const createDocument = asyncHandler(async (req, res) =>
  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        await documentService.uploadDocument(
          req.params.caseId,
          normalizeUploadBody(req.body),
          req.file,
          req.user,
        ),
        "Document uploaded successfully.",
      ),
    ),
);

const bulkUploadDocuments = asyncHandler(async (req, res) =>
  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        await documentService.bulkUploadDocuments(
          req.params.caseId,
          normalizeUploadBody(req.body),
          req.files,
          req.user,
        ),
        "Documents uploaded successfully.",
      ),
    ),
);

const getDocuments = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await documentService.getDocuments(
          req.params.caseId,
          req.query,
          req.user,
        ),
        "Documents fetched successfully.",
      ),
    ),
);

const getDocument = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await documentService.getDocument(
          req.params.caseId,
          req.params.documentId,
          req.user,
        ),
        "Document fetched successfully.",
      ),
    ),
);

const uploadNewVersion = asyncHandler(async (req, res) =>
  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        await documentService.uploadNewVersion(
          req.params.caseId,
          req.params.documentId,
          req.body,
          req.file,
          req.user,
        ),
        "Document version uploaded successfully.",
      ),
    ),
);

const updateVisibility = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await documentService.updateVisibility(
          req.params.caseId,
          req.params.documentId,
          normalizeUploadBody(req.body),
          req.user,
        ),
        "Document visibility updated successfully.",
      ),
    ),
);

const softDeleteDocument = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await documentService.softDeleteDocument(
          req.params.caseId,
          req.params.documentId,
          req.body.reason,
          req.user,
        ),
        "Document deleted successfully.",
      ),
    ),
);

const getDocumentVersions = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await documentService.getDocumentVersions(
          req.params.caseId,
          req.params.documentId,
          req.user,
        ),
        "Document versions fetched successfully.",
      ),
    ),
);

const downloadDocument = asyncHandler(async (req, res) => {
  const file = await documentService.downloadDocument(
    req.params.caseId,
    req.params.documentId,
    req.user,
  );
  res.type(file.mimeType || "application/octet-stream");
  res.attachment(file.name);
  file.stream.pipe(res);
});

const getDocumentAccessLogs = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await documentService.getDocumentAccessLogs(
          req.params.caseId,
          req.params.documentId,
          req.query,
          req.user,
        ),
        "Document access logs fetched successfully.",
      ),
    ),
);

module.exports = {
  createDocument,
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
