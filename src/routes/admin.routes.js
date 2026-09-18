const express = require("express");
const adminController = require("../controllers/admin.controller");
const auth = require("../middlewares/auth.middleware");
const requireRole = require("../middlewares/role.middleware");
const validate = require("../middlewares/validate.middleware");
const { RoleName } = require("../constants/auth.constants");
const {
  dashboardQuerySchema,
  adminUsersQuerySchema,
  adminCasesQuerySchema,
  adminInvoicesQuerySchema,
  adminAuditLogsQuerySchema,
  adminAuditLogsExportQuerySchema,
} = require("../validations/admin.validation");

const router = express.Router();

router.use(auth);
router.use(requireRole(RoleName.SUPER_ADMIN, RoleName.ADMIN_LEADERSHIP));

router.get(
  "/dashboard",
  validate(dashboardQuerySchema, "query"),
  adminController.getDashboard,
);

router.get(
  "/users",
  validate(adminUsersQuerySchema, "query"),
  adminController.getUsers,
);

router.get(
  "/cases",
  validate(adminCasesQuerySchema, "query"),
  adminController.getCases,
);

router.get(
  "/invoices",
  validate(adminInvoicesQuerySchema, "query"),
  adminController.getInvoices,
);

router.get(
  "/audit-logs",
  validate(adminAuditLogsQuerySchema, "query"),
  adminController.getAuditLogs,
);

router.get(
  "/audit-logs/export",
  validate(adminAuditLogsExportQuerySchema, "query"),
  adminController.exportAuditLogs,
);

router.get("/audit-logs/:id", adminController.getAuditLogById);

module.exports = router;
