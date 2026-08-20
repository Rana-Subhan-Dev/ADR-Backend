const express = require("express");

const partyController = require("../controllers/party.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const {
  createPartySchema,
  getPartiesSchema,
  partyIdSchema,
  updatePartySchema,
} = require("../validations/party.validation");

const router = express.Router();

router.use(auth);

router.post("/", validate(createPartySchema), partyController.createParty);

router.get(
  "/",
  validate(getPartiesSchema, "query"),
  partyController.getParties,
);

router.patch(
  "/:id",
  validate(partyIdSchema, "params"),
  validate(updatePartySchema),
  partyController.updateParty,
);

router.delete(
  "/:id",
  validate(partyIdSchema, "params"),
  partyController.deleteParty,
);

module.exports = router;
