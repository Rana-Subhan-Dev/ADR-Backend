const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
require("dotenv").config();

const errorHandler = require("./middlewares/errorHandler.middleware");
const rateLimiter = require("./middlewares/rateLimiter.middleware");
const indexRoutes = require("./routes/index.routes");
const { connectPrisma, pingDatabase } = require("./config/prisma");
const app = express();

app.use(helmet());

const allowedOrigins = ["http://localhost:3000"];

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

const docusignWebhookRoutes = require("./routes/docusignWebhook.routes");
app.use(
  "/api/v1/webhooks/docusign",
  express.raw({ type: "*/*", limit: "5mb" }),
  (req, _res, next) => {
    req.rawBody = req.body;
    next();
  },
  docusignWebhookRoutes,
);

app.use(
  express.json({
    limit: "10mb",
  }),
);

app.use(cookieParser());

app.get("/api/v1/health", async (req, res) => {
  try {
    await pingDatabase();
    return res.status(200).json({
      success: true,
      message: "FEDARB API is running",
      database: "up",
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: "API is up but database is unreachable",
      database: "down",
    });
  }
});

app.set('trust proxy', 1);
app.use("/api/v1", rateLimiter, indexRoutes);

app.use(errorHandler);

const PORT = process.env.PORT;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  const connected = await connectPrisma();
  if (!connected) {
    console.error(
      "[prisma] Server started without a live database connection. Health will report database: down until connectivity is restored.",
    );
  }
});
