const express = require("express");
const controller = require("../controllers/docusign.controller");

const router = express.Router();

// Body is captured as Buffer by parent route raw parser for HMAC verification.
router.post("/", controller.handleWebhook);

module.exports = router;
