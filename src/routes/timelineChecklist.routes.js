const express = require("express");
const timelineChecklistController = require("../controllers/timelineChecklist.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const {
  caseIdSchema,
  itemIdSchema,
  getTimelineSchema,
  createChecklistItemSchema,
  updateChecklistItemSchema,
  getChecklistItemsSchema,
} = require("../validations/timelineChecklist.validation");

const router = express.Router({ mergeParams: true });

router.use(auth);
router.get(
  "/timeline",
  validate(caseIdSchema, "params"),
  validate(getTimelineSchema, "query"),
  timelineChecklistController.getTimeline,
);
router.post(
  "/checklists",
  validate(caseIdSchema, "params"),
  validate(createChecklistItemSchema),
  timelineChecklistController.createChecklistItem,
);
router.get(
  "/checklists",
  validate(caseIdSchema, "params"),
  validate(getChecklistItemsSchema, "query"),
  timelineChecklistController.getChecklistItems,
);
router.get(
  "/checklists/:itemId",
  validate(itemIdSchema, "params"),
  timelineChecklistController.getChecklistItem,
);
router.patch(
  "/checklists/:itemId",
  validate(itemIdSchema, "params"),
  validate(updateChecklistItemSchema),
  timelineChecklistController.updateChecklistItem,
);
router.delete(
  "/checklists/:itemId",
  validate(itemIdSchema, "params"),
  timelineChecklistController.deleteChecklistItem,
);
router.post(
  "/checklists/:itemId/complete",
  validate(itemIdSchema, "params"),
  timelineChecklistController.completeChecklistItem,
);
router.post(
  "/checklists/:itemId/reopen",
  validate(itemIdSchema, "params"),
  timelineChecklistController.reopenChecklistItem,
);

module.exports = router;
