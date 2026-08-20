const express = require("express");

const inquiryController = require("../controllers/inquiry.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");

const {
  createInquirySchema,
  updateInquirySchema,
  getInquiriesSchema,
  inquiryIdSchema,
  convertToCaseSchema,
} = require("../validations/inquiry.validation");

const router = express.Router();

router.use(auth);

router.post(
  "/",
  validate(createInquirySchema),
  inquiryController.createInquiry,
);

router.get(
  "/",
  validate(getInquiriesSchema, "query"),
  inquiryController.getInquiries,
);

router.get(
  "/:id",
  validate(inquiryIdSchema, "params"),
  inquiryController.getInquiryById,
);

router.patch(
  "/:id",
  validate(inquiryIdSchema, "params"),
  validate(updateInquirySchema),
  inquiryController.updateInquiry,
);

router.post(
  "/:id/convert-to-case",
  validate(inquiryIdSchema, "params"),
  validate(convertToCaseSchema),
  inquiryController.convertToCase,
);

module.exports = router;
