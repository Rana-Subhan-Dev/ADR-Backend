const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
require("dotenv").config();

const errorHandler = require("./middlewares/errorHandler.middleware");
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const caseRoutes = require("./routes/case.routes");
const inquiryRoutes = require("./routes/inquiry.routes");
const partyRoutes = require("./routes/party.routes");
const attorneyLawFirmRoutes = require("./routes/attorneyLawFirm.routes");
const representationRoutes = require("./routes/representation.routes");
const participantRoutes = require("./routes/participant.routes");
const hearingRoutes = require("./routes/hearing.routes");

const app = express();

app.use(helmet());

const allowedOrigins = [
  'http://localhost:3000/',
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "ngrok-skip-browser-warning"
  ]
};

app.use(cors(corsOptions));

app.use(morgan("dev"));

app.use(
  express.json({
    limit: "10mb",
  })
);

app.use(cookieParser());

app.get("/api/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "FEDARB API is running",
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/inquiries", inquiryRoutes);
app.use("/api/v1/cases", caseRoutes);
app.use("/api/v1/cases/:caseId/participants", participantRoutes);
app.use("/api/v1/cases/:caseId/hearings", hearingRoutes);
app.use("/api/v1/parties", partyRoutes);
app.use("/api/v1/attorneys-law-firms", attorneyLawFirmRoutes);
app.use("/api/v1/representations", representationRoutes);

app.use(errorHandler);


const PORT = process.env.PORT;


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
