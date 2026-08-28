const express = require("express");
const documentController = require("../controllers/document.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const upload = require("../middlewares/upload.middleware");
const normalizeDocumentPayload = require("../middlewares/normalizeDocumentPayload.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const {
  PermissionModule,
  PermissionAction,
} = require("../constants/permission.constants");
const {
  caseIdSchema,
  documentIdSchema,
  documentFileSchema,
  uploadVersionSchema,
  visibilitySchema,
  deleteSchema,
  listSchema,
  accessLogSchema,
} = require("../validations/document.validation");

const router = express.Router({ mergeParams: true });

router.use(auth);
router.post(
  "/",
  requirePermission(PermissionModule.DOCUMENTS, PermissionAction.CREATE),
  validate(caseIdSchema, "params"),
  upload.single("file"),
  normalizeDocumentPayload,
  validate(documentFileSchema),
  documentController.createDocument,
);
router.post(
  "/bulk",
  requirePermission(PermissionModule.DOCUMENTS, PermissionAction.CREATE),
  validate(caseIdSchema, "params"),
  upload.array("files", 10),
  normalizeDocumentPayload,
  validate(documentFileSchema),
  documentController.bulkUploadDocuments,
);
router.get(
  "/",
  requirePermission(PermissionModule.DOCUMENTS, PermissionAction.VIEW),
  validate(caseIdSchema, "params"),
  validate(listSchema, "query"),
  documentController.getDocuments,
);
router.get(
  "/:documentId",
  requirePermission(PermissionModule.DOCUMENTS, PermissionAction.VIEW),
  validate(documentIdSchema, "params"),
  documentController.getDocument,
);
router.post(
  "/:documentId/versions",
  requirePermission(PermissionModule.DOCUMENTS, PermissionAction.CREATE),
  validate(documentIdSchema, "params"),
  upload.single("file"),
  validate(uploadVersionSchema),
  documentController.uploadNewVersion,
);
router.patch(
  "/:documentId/visibility",
  requirePermission(PermissionModule.DOCUMENTS, PermissionAction.EDIT),
  validate(documentIdSchema, "params"),
  normalizeDocumentPayload,
  validate(visibilitySchema),
  documentController.updateVisibility,
);
router.delete(
  "/:documentId",
  requirePermission(PermissionModule.DOCUMENTS, PermissionAction.DELETE),
  validate(documentIdSchema, "params"),
  validate(deleteSchema),
  documentController.softDeleteDocument,
);
router.get(
  "/:documentId/versions",
  requirePermission(PermissionModule.DOCUMENTS, PermissionAction.VIEW),
  validate(documentIdSchema, "params"),
  documentController.getDocumentVersions,
);
router.get(
  "/:documentId/download",
  requirePermission(PermissionModule.DOCUMENTS, PermissionAction.VIEW),
  validate(documentIdSchema, "params"),
  documentController.downloadDocument,
);
router.get(
  "/:documentId/access-logs",
  requirePermission(PermissionModule.DOCUMENTS, PermissionAction.VIEW),
  validate(documentIdSchema, "params"),
  validate(accessLogSchema, "query"),
  documentController.getDocumentAccessLogs,
);

module.exports = router;
