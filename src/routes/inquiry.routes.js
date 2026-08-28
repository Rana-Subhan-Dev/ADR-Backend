const express = require("express");

const inquiryController = require("../controllers/inquiry.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const {
  requirePermission,
  requireInternalRole,
} = require("../middlewares/permission.middleware");
const {
  PermissionModule,
  PermissionAction,
} = require("../constants/permission.constants");
const { RoleName } = require("../constants/auth.constants");

const {
  createInquirySchema,
  updateInquirySchema,
  getInquiriesSchema,
  inquiryIdSchema,
  convertToCaseSchema,
} = require("../validations/inquiry.validation");

const router = express.Router();

router.use(auth);
const internalOperations = requireInternalRole(
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN_LEADERSHIP,
  RoleName.CASE_MANAGER,
);

router.post(
  "/",
  requirePermission(PermissionModule.CASES, PermissionAction.CREATE),
  internalOperations,
  validate(createInquirySchema),
  inquiryController.createInquiry,
);

router.get(
  "/",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  internalOperations,
  validate(getInquiriesSchema, "query"),
  inquiryController.getInquiries,
);

router.get(
  "/:id",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  internalOperations,
  validate(inquiryIdSchema, "params"),
  inquiryController.getInquiryById,
);

router.patch(
  "/:id",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  internalOperations,
  validate(inquiryIdSchema, "params"),
  validate(updateInquirySchema),
  inquiryController.updateInquiry,
);

router.post(
  "/:id/convert-to-case",
  requirePermission(PermissionModule.CASES, PermissionAction.CREATE),
  internalOperations,
  validate(inquiryIdSchema, "params"),
  validate(convertToCaseSchema),
  inquiryController.convertToCase,
);

module.exports = router;
