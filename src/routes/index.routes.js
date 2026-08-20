const authRoutes = require("./auth.routes");
const userRoutes = require("./user.routes");
const caseRoutes = require("./case.routes");
const inquiryRoutes = require("./inquiry.routes");
const partyRoutes = require("./party.routes");
const attorneyLawFirmRoutes = require("./attorneyLawFirm.routes");
const representationRoutes = require("./representation.routes");
const participantRoutes = require("./participant.routes");
const hearingRoutes = require("./hearing.routes");
const express = require("express");
const router = express.Router();

const defaultRoutes = [
  {
    path: "/auth",
    route: authRoutes,
  },
  {
    path: "/users",
    route: userRoutes,
  },
  {
    path: "/cases",
    route: caseRoutes,
  },
  {
    path: "/inquiries",
    route: inquiryRoutes,
  },
  {
    path: "/parties",
    route: partyRoutes,
  },
  {
    path: "/attorneys-law-firms",
    route: attorneyLawFirmRoutes,
  },
  {
    path: "/representations",
    route: representationRoutes,
  },
  {
    path: "/cases/:caseId/participants",
    route: participantRoutes,
  },
  {
    path: "/cases/:caseId/hearings",
    route: hearingRoutes,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

module.exports = router;
