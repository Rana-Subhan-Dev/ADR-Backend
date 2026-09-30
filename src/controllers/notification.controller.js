const notificationService = require("../services/notification.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const getNotifications = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await notificationService.getNotifications(req.query, req.user),
        "Notifications fetched successfully.",
      ),
    ),
);

const getUnreadCount = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await notificationService.getUnreadCount(req.user),
        "Unread notification count fetched successfully.",
      ),
    ),
);

const markNotificationRead = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await notificationService.markRead(
          req.params.notificationId,
          req.user,
        ),
        "Notification marked as read.",
      ),
    ),
);

const markAllNotificationsRead = asyncHandler(async (req, res) =>
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        await notificationService.markAllRead(req.user),
        "All notifications marked as read.",
      ),
    ),
);

module.exports = {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
};
