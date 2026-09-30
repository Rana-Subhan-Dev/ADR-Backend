const express = require("express");
const participantController = require("../controllers/participant.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const { requirePermission } = require("../middlewares/permission.middleware");
const {
  PermissionModule,
  PermissionAction,
} = require("../constants/permission.constants");
const { listParticipantsHubSchema } = require("../validations/participant.validation");

const router = express.Router();

router.use(auth);

router.get(
  "/",
  requirePermission(PermissionModule.CASES, PermissionAction.VIEW),
  validate(listParticipantsHubSchema, "query"),
  participantController.listParticipantsHub,
);

module.exports = router;
