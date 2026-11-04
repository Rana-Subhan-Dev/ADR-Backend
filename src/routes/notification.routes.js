const express = require("express");
const notificationController = require("../controllers/notification.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const {
  notificationIdSchema,
  listNotificationsSchema,
} = require("../validations/notification.validation");

const router = express.Router();

// Inbox is always scoped to the authenticated user — no module permission required
// (e.g. ACCOUNTING_STAFF has no CASES VIEW but must read their own notifications).
router.use(auth);

router.get(
  "/",
  validate(listNotificationsSchema, "query"),
  notificationController.getNotifications,
);

router.get("/unread-count", notificationController.getUnreadCount);

router.patch(
  "/read-all",
  notificationController.markAllNotificationsRead,
);

router.patch(
  "/:notificationId/read",
  validate(notificationIdSchema, "params"),
  notificationController.markNotificationRead,
);

module.exports = router;
