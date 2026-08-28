const express = require("express");
const timelineChecklistController = require("../controllers/timelineChecklist.controller");
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
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(caseIdSchema, "params"),
  validate(getTimelineSchema, "query"),
  timelineChecklistController.getTimeline,
);
router.post(
  "/checklists",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(caseIdSchema, "params"),
  validate(createChecklistItemSchema),
  timelineChecklistController.createChecklistItem,
);
router.get(
  "/checklists",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(caseIdSchema, "params"),
  validate(getChecklistItemsSchema, "query"),
  timelineChecklistController.getChecklistItems,
);
router.get(
  "/checklists/:itemId",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(itemIdSchema, "params"),
  timelineChecklistController.getChecklistItem,
);
router.patch(
  "/checklists/:itemId",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(itemIdSchema, "params"),
  validate(updateChecklistItemSchema),
  timelineChecklistController.updateChecklistItem,
);
router.delete(
  "/checklists/:itemId",
  requirePermission(PermissionModule.CASES, PermissionAction.DELETE),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(itemIdSchema, "params"),
  timelineChecklistController.deleteChecklistItem,
);
router.post(
  "/checklists/:itemId/complete",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(itemIdSchema, "params"),
  timelineChecklistController.completeChecklistItem,
);
router.post(
  "/checklists/:itemId/reopen",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(itemIdSchema, "params"),
  timelineChecklistController.reopenChecklistItem,
);

module.exports = router;
