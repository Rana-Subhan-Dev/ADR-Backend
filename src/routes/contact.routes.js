const express = require("express");
const contactController = require("../controllers/contact.controller");
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
  contactIdSchema,
  createContactSchema,
  updateContactSchema,
  listContactsSchema,
} = require("../validations/contact.validation");

const router = express.Router();

router.use(auth);

router.get(
  "/",
  requirePermission(PermissionModule.PARTIES, PermissionAction.VIEW),
  validate(listContactsSchema, "query"),
  contactController.getContacts,
);

router.get(
  "/:contactId",
  requirePermission(PermissionModule.PARTIES, PermissionAction.VIEW),
  validate(contactIdSchema, "params"),
  contactController.getContact,
);

router.post(
  "/",
  requirePermission(PermissionModule.PARTIES, PermissionAction.CREATE),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(createContactSchema),
  contactController.createContact,
);

router.patch(
  "/:contactId",
  requirePermission(PermissionModule.PARTIES, PermissionAction.EDIT),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(contactIdSchema, "params"),
  validate(updateContactSchema),
  contactController.updateContact,
);

router.delete(
  "/:contactId",
  requirePermission(PermissionModule.PARTIES, PermissionAction.DELETE),
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  validate(contactIdSchema, "params"),
  contactController.deleteContact,
);

module.exports = router;
