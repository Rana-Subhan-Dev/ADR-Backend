const express = require("express");

const userController = require("../controllers/user.controller");
const auth = require("../middlewares/auth.middleware");
const requireRole = require("../middlewares/role.middleware");
const validate = require("../middlewares/validate.middleware");
const { RoleName } = require("../constants/auth.constants");

const {
  getUsersSchema,
  userIdSchema,
  updateUserSchema,
  updateUserStatusSchema,
} = require("../validations/user.validation");

const router = express.Router();

router.use(auth);

router.get(
  "/",
  validate(getUsersSchema, "query"),
  userController.getUsers
);

router.get(
  "/:id",
  validate(userIdSchema, "params"),
  userController.getUserById
);

router.patch(
  "/:id",
  validate(userIdSchema, "params"),
  validate(updateUserSchema),
  userController.updateUser
);

router.patch(
  "/:id/status",
  requireRole(RoleName.SUPER_ADMIN, RoleName.ADMIN_LEADERSHIP),
  validate(userIdSchema, "params"),
  validate(updateUserStatusSchema),
  userController.updateUserStatus
);

module.exports = router;
