const prisma = require("../config/prisma");

const notificationSelect = {
  id: true,
  eventType: true,
  subject: true,
  relatedRecordType: true,
  relatedRecordId: true,
  templateData: true,
  createdAt: true,
  readAt: true,
  channel: true,
  deliveryStatus: true,
};

const getNotifications = ({ where, skip, take }) =>
  prisma.$transaction([
    prisma.notification.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: notificationSelect,
    }),
    prisma.notification.count({ where }),
  ]);

const countNotifications = (where) => prisma.notification.count({ where });

const findNotificationById = (id) =>
  prisma.notification.findUnique({
    where: { id },
    select: { ...notificationSelect, recipientUserId: true },
  });

const markNotificationRead = (id, readAt = new Date()) =>
  prisma.notification.update({
    where: { id },
    data: { readAt },
    select: notificationSelect,
  });

const markAllNotificationsRead = (recipientUserId, readAt = new Date()) =>
  prisma.notification.updateMany({
    where: { recipientUserId, readAt: null, channel: "IN_APP" },
    data: { readAt },
  });

const createNotification = (data, tx = prisma) =>
  tx.notification.create({ data, select: notificationSelect });

const createNotifications = (data, tx = prisma) =>
  tx.notification.createMany({ data });

module.exports = {
  notificationSelect,
  getNotifications,
  countNotifications,
  findNotificationById,
  markNotificationRead,
  markAllNotificationsRead,
  createNotification,
  createNotifications,
};
