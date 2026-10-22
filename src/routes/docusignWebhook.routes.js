const express = require("express");
const controller = require("../controllers/docusign.controller");

const router = express.Router();

// Dropbox Sign callbacks: multipart (json field) or JSON; ack with "Hello API Event Received".
router.post("/", ...(Array.isArray(controller.handleWebhook)
  ? controller.handleWebhook
  : [controller.handleWebhook]));

module.exports = router;
