const express = require("express");

const authController = require("../controllers/auth.controller");
const auth = require("../middlewares/auth.middleware");
const requireRole = require("../middlewares/role.middleware");
const validate = require("../middlewares/validate.middleware");
const { RoleName } = require("../constants/auth.constants");

const {
  inviteUserSchema,
  acceptInvitationSchema,
  signInSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("../validations/auth.validation");

const router = express.Router();

router.post(
  "/invite",
  auth,
  requireRole(RoleName.SUPER_ADMIN, RoleName.ADMIN_LEADERSHIP),
  validate(inviteUserSchema),
  authController.inviteUser,
);

router.post(
  "/accept-invitation",
  validate(acceptInvitationSchema),
  authController.acceptInvitation,
);

router.post("/signin", validate(signInSchema), authController.signIn);

router.post(
  "/forgot-password",
  validate(forgotPasswordSchema),
  authController.forgotPassword,
);

router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  authController.resetPassword,
);

module.exports = router;
