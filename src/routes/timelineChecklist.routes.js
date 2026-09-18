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

router.get(
  "/checklists",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(caseIdSchema, "params"),
  validate(getChecklistItemsSchema, "query"),
  timelineChecklistController.getChecklistItems,
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
  "/checklists/:itemId/not-applicable",
  requirePermission(PermissionModule.CASES, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(itemIdSchema, "params"),
  timelineChecklistController.markChecklistItemNotApplicable,
);

module.exports = router;
