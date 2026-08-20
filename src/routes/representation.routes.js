const express = require("express");
const representationController = require("../controllers/representation.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const {
  createRepresentationSchema,
  updateRepresentationSchema,
  representationIdSchema,
  getRepresentationsSchema,
} = require("../validations/representation.validation");

const router = express.Router();

router.use(auth);

router.post(
  "/",
  validate(createRepresentationSchema),
  representationController.createRepresentation,
);

router.get(
  "/",
  validate(getRepresentationsSchema, "query"),
  representationController.getRepresentations,
);

router.get(
  "/:representationId",
  validate(representationIdSchema, "params"),
  representationController.getRepresentationById,
);

router.patch(
  "/:representationId",
  validate(representationIdSchema, "params"),
  validate(updateRepresentationSchema),
  representationController.updateRepresentation,
);

router.delete(
  "/:representationId",
  validate(representationIdSchema, "params"),
  representationController.deleteRepresentation,
);

module.exports = router;
