const notificationRepository = require("../repositories/notification.repository");
const ApiError = require("../utils/apiError");

const buildHref = (row) => {
  const data = row.templateData || {};
  if (data.href) return data.href;
  if (row.relatedRecordType === "Case" && row.relatedRecordId) {
    return `/case-manager/cases/${row.relatedRecordId}`;
  }
  if (row.relatedRecordType === "Hearing" && row.relatedRecordId) {
    return `/case-manager/hearings/${row.relatedRecordId}`;
  }
  if (row.relatedRecordType === "DocuSignEnvelope" && data.caseId) {
    return `/case-manager/docusign/${row.relatedRecordId}`;
  }
  if (row.relatedRecordType === "Inquiry" && row.relatedRecordId) {
    return `/case-manager/cases/${row.relatedRecordId}/inquiry`;
  }
  return null;
};

const mapNotification = (row) => {
  const templateData = row.templateData || null;
  const title =
    templateData?.title ||
    row.subject ||
    String(row.eventType || "").replace(/_/g, " ");
  const message =
    templateData?.message || templateData?.body || row.subject || null;
  return {
    id: row.id,
    eventType: row.eventType,
    subject: row.subject,
    title,
    message,
    kind: templateData?.kind || row.eventType || null,
    href: buildHref(row),
    case: templateData?.caseNumber || templateData?.case || null,
    matter: templateData?.matter || templateData?.caseTitle || null,
    caseType: templateData?.caseType || null,
    extra: templateData?.extra || null,
    relatedRecordType: row.relatedRecordType,
    relatedRecordId: row.relatedRecordId,
    templateData,
    channel: row.channel,
    createdAt: row.createdAt,
    read: Boolean(row.readAt),
    readAt: row.readAt,
  };
};

const getNotifications = async (query, currentUser) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const unreadOnly = query.unreadOnly === true || query.unreadOnly === "true";
  const readOnly = query.readOnly === true || query.readOnly === "true";
  if (unreadOnly && readOnly) {
    throw new ApiError(400, "unreadOnly and readOnly cannot both be true.");
  }

  const where = {
    recipientUserId: currentUser.id,
    channel: query.channel || "IN_APP",
  };
  if (unreadOnly) where.readAt = null;
  if (readOnly) where.readAt = { not: null };

  const [rows, total] = await notificationRepository.getNotifications({
    where,
    skip: (page - 1) * limit,
    take: limit,
  });
  const unreadCount = await notificationRepository.countNotifications({
    recipientUserId: currentUser.id,
    channel: "IN_APP",
    readAt: null,
  });

  const totalPages = Math.ceil(total / limit) || 1;
  return {
    notifications: rows.map(mapNotification),
    unreadCount,
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

const getUnreadCount = async (currentUser) => {
  const unreadCount = await notificationRepository.countNotifications({
    recipientUserId: currentUser.id,
    channel: "IN_APP",
    readAt: null,
  });
  return { unreadCount };
};

const markRead = async (notificationId, currentUser) => {
  const notification =
    await notificationRepository.findNotificationById(notificationId);
  if (!notification || notification.recipientUserId !== currentUser.id) {
    throw new ApiError(404, "Notification not found.");
  }
  if (notification.readAt) return mapNotification(notification);
  const updated = await notificationRepository.markNotificationRead(
    notificationId,
  );
  return mapNotification(updated);
};

const markAllRead = async (currentUser) => {
  const { count } = await notificationRepository.markAllNotificationsRead(
    currentUser.id,
  );
  return { updatedCount: count };
};

const createInAppNotification = async (
  {
    recipientUserId,
    eventType,
    subject,
    templateData,
    relatedRecordType,
    relatedRecordId,
  },
  tx = null,
) => {
  if (!recipientUserId) return null;
  return notificationRepository.createNotification(
    {
      recipientUserId,
      channel: "IN_APP",
      eventType,
      subject: subject || null,
      templateData: templateData || undefined,
      relatedRecordType: relatedRecordType || null,
      relatedRecordId: relatedRecordId || null,
      deliveryStatus: "SENT",
      sentAt: new Date(),
    },
    tx,
  );
};

const notifyCaseManagers = async (
  caseId,
  payload,
  { excludeUserId = null, tx = null } = {},
) => {
  const managers = await (tx || require("../config/prisma")).caseParticipant.findMany({
    where: {
      caseId,
      role: "CASE_MANAGER",
      accessStatus: "ACTIVE",
      ...(excludeUserId && { userId: { not: excludeUserId } }),
    },
    select: { userId: true },
  });
  const unique = [...new Set(managers.map((row) => row.userId))];
  const results = [];
  for (const recipientUserId of unique) {
    results.push(
      await createInAppNotification({ ...payload, recipientUserId }, tx),
    );
  }
  return results;
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  createInAppNotification,
  notifyCaseManagers,
  mapNotification,
};
