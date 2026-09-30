const express = require("express");
const notificationController = require("../controllers/notification.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const {
  PermissionModule,
  PermissionAction,
} = require("../constants/permission.constants");
const {
  notificationIdSchema,
  listNotificationsSchema,
} = require("../validations/notification.validation");

const router = express.Router();

router.use(auth);

router.get(
  "/",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(listNotificationsSchema, "query"),
  notificationController.getNotifications,
);

router.get(
  "/unread-count",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  notificationController.getUnreadCount,
);

router.patch(
  "/read-all",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  notificationController.markAllNotificationsRead,
);

router.patch(
  "/:notificationId/read",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(notificationIdSchema, "params"),
  notificationController.markNotificationRead,
);

module.exports = router;
