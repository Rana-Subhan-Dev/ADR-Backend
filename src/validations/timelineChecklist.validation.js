const Joi = require("joi");
const {
  CaseTimelineEventType,
  ChecklistCategory,
  ChecklistStatus,
  ChecklistItemType,
} = require("@prisma/client");

const caseIdSchema = Joi.object({ caseId: Joi.string().uuid().required() });
const itemIdSchema = Joi.object({
  caseId: Joi.string().uuid().required(),
  itemId: Joi.string().uuid().required(),
});

const getTimelineSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  eventType: Joi.string()
    .valid(...Object.values(CaseTimelineEventType))
    .optional(),
  actorUserId: Joi.string().uuid().optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
})
  .custom((value, helpers) => {
    if (value.from && value.to && value.to < value.from)
      return helpers.error("any.invalid");
    return value;
  })
  .messages({ "any.invalid": "to must be later than from." });

const createChecklistItemSchema = Joi.object({
  category: Joi.string()
    .valid(...Object.values(ChecklistCategory))
    .required(),
  label: Joi.string().trim().min(1).max(500).required(),
  relatedModule: Joi.string().trim().max(100).allow("", null).optional(),
});

const updateChecklistItemSchema = Joi.object({
  category: Joi.string()
    .valid(...Object.values(ChecklistCategory))
    .optional(),
  label: Joi.string().trim().min(1).max(500).optional(),
  relatedModule: Joi.string().trim().max(100).allow("", null).optional(),
}).min(1);

const getChecklistItemsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  category: Joi.string()
    .valid(...Object.values(ChecklistCategory))
    .optional(),
  status: Joi.string()
    .valid(...Object.values(ChecklistStatus))
    .optional(),
  type: Joi.string()
    .valid(...Object.values(ChecklistItemType))
    .optional(),
});

module.exports = {
  caseIdSchema,
  itemIdSchema,
  getTimelineSchema,
  createChecklistItemSchema,
  updateChecklistItemSchema,
  getChecklistItemsSchema,
};
