const express = require("express");
const documentController = require("../controllers/document.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const {
  PermissionModule,
  PermissionAction,
} = require("../constants/permission.constants");
const { listDocumentsHubSchema } = require("../validations/document.validation");

const router = express.Router();

router.use(auth);

router.get(
  "/",
  requirePermission(PermissionModule.DOCUMENTS, PermissionAction.VIEW),
  validate(listDocumentsHubSchema, "query"),
  documentController.listDocumentsHub,
);

module.exports = router;
