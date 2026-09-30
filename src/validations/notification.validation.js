const Joi = require("joi");
const { NotificationChannel } = require("@prisma/client");

const notificationIdSchema = Joi.object({
  notificationId: Joi.string().uuid().required(),
});

const listNotificationsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  unreadOnly: Joi.boolean().optional(),
  readOnly: Joi.boolean().optional(),
  channel: Joi.string()
    .valid(...Object.values(NotificationChannel))
    .optional(),
}).custom((value, helpers) => {
  if (value.unreadOnly && value.readOnly) {
    return helpers.message("unreadOnly and readOnly cannot both be true.");
  }
  return value;
});

module.exports = {
  notificationIdSchema,
  listNotificationsSchema,
};
