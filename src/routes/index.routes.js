const authRoutes = require("./auth.routes");
const userRoutes = require("./user.routes");
const caseRoutes = require("./case.routes");
const inquiryRoutes = require("./inquiry.routes");
const partyRoutes = require("./party.routes");
const attorneyLawFirmRoutes = require("./attorneyLawFirm.routes");
const representationRoutes = require("./representation.routes");
const participantRoutes = require("./participant.routes");
const hearingRoutes = require("./hearing.routes");
const hearingHubRoutes = require("./hearing.routes").hubRouter;
const caseNoteRoutes = require("./caseNote.routes");
const documentRoutes = require("./document.routes");
const documentHubRoutes = require("./documentHub.routes");
const participantHubRoutes = require("./participantHub.routes");
const contactRoutes = require("./contact.routes");
const dashboardRoutes = require("./dashboard.routes");
const notificationRoutes = require("./notification.routes");
const reportRoutes = require("./report.routes");
const timelineChecklistRoutes = require("./timelineChecklist.routes");
const timesheetRoutes = require("./timesheet.routes");
const docusignRoutes = require("./docusign.routes");
const billingRoutes = require("./billing.routes");
const adminRoutes = require("./admin.routes");
const express = require("express");
const router = express.Router();

const defaultRoutes = [
  {
    path: "/auth",
    route: authRoutes,
  },
  {
    path: "/admin",
    route: adminRoutes,
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
    path: "/hearings",
    route: hearingHubRoutes,
  },
  {
    path: "/documents",
    route: documentHubRoutes,
  },
  {
    path: "/participants",
    route: participantHubRoutes,
  },
  {
    path: "/contacts",
    route: contactRoutes,
  },
  {
    path: "/dashboard",
    route: dashboardRoutes,
  },
  {
    path: "/notifications",
    route: notificationRoutes,
  },
  {
    path: "/reports",
    route: reportRoutes,
  },
  {
    path: "/cases/:caseId/hearings",
    route: hearingRoutes,
  },
  {
    path: "/cases/:caseId/notes",
    route: caseNoteRoutes,
  },
  {
    path: "/cases/:caseId/documents",
    route: documentRoutes,
  },
  {
    path: "/cases/:caseId",
    route: timelineChecklistRoutes,
  },
  {
    path: "/cases/:caseId/timesheets",
    route: timesheetRoutes,
  },
  {
    path: "/cases/:caseId/docusign",
    route: docusignRoutes,
  },
  {
    path: "/billing",
    route: billingRoutes,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

module.exports = router;
