const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");

const errorHandler = require("./middlewares/errorHandler.middleware");
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const caseRoutes = require("./routes/case.routes");
const inquiryRoutes = require("./routes/inquiry.routes");

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:8000",
    credentials: true,
  })
);

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
    message: "FEDARB API is running 🚀",
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/inquiries", inquiryRoutes);
app.use("/api/v1/cases", caseRoutes);

app.use(errorHandler);

module.exports = app;
