const express = require("express");
const controller = require("../controllers/practiceLibrary.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const {
  requireInternalRole,
} = require("../middlewares/permission.middleware");
const { RoleName } = require("../constants/auth.constants");
const { uploadToS3 } = require("../utils/s3Helper");
const {
  listPracticeLibrarySchema,
  practiceLibraryIdSchema,
  createPracticeLibrarySchema,
} = require("../validations/practiceLibrary.validation");

const router = express.Router();
router.use(auth);

router.get(
  "/",
  validate(listPracticeLibrarySchema, "query"),
  controller.listPracticeLibrary,
);

router.get(
  "/:id",
  validate(practiceLibraryIdSchema, "params"),
  controller.getPracticeLibraryItem,
);

router.post(
  "/",
  requireInternalRole(
    RoleName.SUPER_ADMIN,
    RoleName.ADMIN_LEADERSHIP,
    RoleName.CASE_MANAGER,
  ),
  uploadToS3.single("file"),
  validate(createPracticeLibrarySchema),
  controller.createPracticeLibraryItem,
);

module.exports = router;