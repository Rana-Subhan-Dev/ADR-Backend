const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
require("dotenv").config();

const errorHandler = require("./middlewares/errorHandler.middleware");
const rateLimiter = require("./middlewares/rateLimiter.middleware");
const indexRoutes = require("./routes/index.routes");
const app = express();

app.use(helmet());

const allowedOrigins = ["http://localhost:3000/"];

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
    "ngrok-skip-browser-warning",
  ],
};

app.use(cors(corsOptions));

app.use(morgan("dev"));

app.use(
  express.json({
    limit: "10mb",
  }),
);

app.use(cookieParser());

app.get("/api/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "FEDARB API is running",
  });
});

app.use("/api/v1", rateLimiter, indexRoutes);

app.use(errorHandler);

const PORT = process.env.PORT;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
