const express = require("express");
const attorneyLawFirmController = require("../controllers/attorneyLawFirm.controller");
const auth = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const {
  createLawFirmSchema,
  updateLawFirmSchema,
  lawFirmIdSchema,
  getLawFirmsSchema,
  createAttorneySchema,
  updateAttorneySchema,
  attorneyIdSchema,
  getAttorneysSchema,
  attorneyDetailsSchema,
} = require("../validations/attorneyLawFirm.validation");

const router = express.Router();

router.use(auth);

router.post(
  "/law-firms",
  validate(createLawFirmSchema),
  attorneyLawFirmController.createLawFirm);
router.get(
  "/law-firms",
  validate(getLawFirmsSchema, "query"),
  attorneyLawFirmController.getLawFirms);
router.get(
  "/law-firms/:lawFirmId",
  validate(lawFirmIdSchema, "params"),
  attorneyLawFirmController.getLawFirmById);
router.patch(
  "/law-firms/:lawFirmId",
  validate(lawFirmIdSchema, "params"),
  validate(updateLawFirmSchema),
  attorneyLawFirmController.updateLawFirm);
router.delete(
  "/law-firms/:lawFirmId",
  validate(lawFirmIdSchema, "params"),
  attorneyLawFirmController.deleteLawFirm);

router.post(
  "/attorneys",
  validate(createAttorneySchema),
  attorneyLawFirmController.createAttorney);
router.get(
  "/attorneys",
  validate(getAttorneysSchema, "query"),
  attorneyLawFirmController.getAttorneys);
router.get(
  "/attorneys/:attorneyId",
  validate(attorneyIdSchema, "params"),
  validate(attorneyDetailsSchema, "query"), 
  attorneyLawFirmController.getAttorneyById);
router.patch(
  "/attorneys/:attorneyId", 
  validate(attorneyIdSchema, "params"), 
  validate(updateAttorneySchema), 
  attorneyLawFirmController.updateAttorney);
router.delete(
  "/attorneys/:attorneyId",
  validate(attorneyIdSchema, "params"), 
  attorneyLawFirmController.deleteAttorney);

module.exports = router;
