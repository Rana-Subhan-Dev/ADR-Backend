const path = require("path");
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

const helloSignUmdPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "hellosign-embedded",
  "umd",
  "embedded.production.min.js",
);

// Local UMD — avoids CDN CORB / blocked cross-origin script issues.
app.get("/vendor/hellosign-embedded.min.js", (_req, res) => {
  res.type("application/javascript");
  res.sendFile(helloSignUmdPath);
});

// Must be registered before helmet — Dropbox Sign embed needs relaxed CSP / framing.
app.get("/docusign-embed-test", (req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dropbox Sign embed test</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; max-width: 720px; }
    #status { white-space: pre-wrap; }
    code { word-break: break-all; }
  </style>
  <script src="/vendor/hellosign-embedded.min.js"></script>
</head>
<body>
  <h1>Dropbox Sign embed test</h1>
  <p id="status">Starting Dropbox Sign…</p>
  <div id="debug"></div>
  <script>
    (function () {
      var statusEl = document.getElementById("status");
      var debugEl = document.getElementById("debug");
      var params = new URLSearchParams(window.location.search);
      var signUrl = params.get("signUrl");
      var clientId = params.get("clientId");

      function setStatus(msg) {
        statusEl.textContent = msg;
      }

      function fail(msg) {
        setStatus(msg);
        debugEl.innerHTML =
          "<p><strong>signUrl:</strong> <code>" +
          (signUrl || "(missing)") +
          "</code></p><p><strong>clientId:</strong> <code>" +
          (clientId || "(missing)") +
          "</code></p>";
      }

      if (!signUrl || !clientId) {
        fail("Missing signUrl or clientId query params. Call POST .../signing-url and open embedTestUrl.");
        return;
      }

      var HelloSignCtor =
        typeof window.HelloSign === "function"
          ? window.HelloSign
          : window.HelloSign && typeof window.HelloSign.default === "function"
            ? window.HelloSign.default
            : null;

      if (!HelloSignCtor) {
        fail("hellosign-embedded failed to load from /vendor/hellosign-embedded.min.js");
        return;
      }

      try {
        var client = new HelloSignCtor({ clientId: clientId });
        client.on("error", function (data) {
          fail(
            "Embed error: " +
              (data && (data.description || data.message)
                ? data.description || data.message
                : JSON.stringify(data)),
          );
        });
        client.on("close", function () {
          setStatus("Signing window closed.");
        });
        client.on("sign", function () {
          setStatus("Signed successfully. You can close this tab.");
        });
        client.open(signUrl, {
          skipDomainVerification: true,
          allowCancel: true,
        });
        setStatus("Signing UI should appear in a modal. If not, check the console.");
      } catch (err) {
        fail("Failed to open embed: " + (err && err.message ? err.message : String(err)));
      }
    })();
  </script>
</body>
</html>`);
});

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
// Dropbox Sign posts multipart form (json field) or JSON; parsing is handled in the webhook controller.
app.use("/api/v1/webhooks/docusign", docusignWebhookRoutes);

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
