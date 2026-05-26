import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import predictionRoutes from "./routes/predictionRoutes.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve from server/src to server/.. (project root) to client
const clientRoot = path.resolve(__dirname, "../../client");
const configuredOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isVercelOrigin(origin) {
  try {
    return new URL(origin).hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function buildCorsOrigin() {
  if (!configuredOrigins.length || configuredOrigins.includes("*")) {
    return true;
  }

  return (origin, callback) => {
    if (!origin || configuredOrigins.includes(origin) || isVercelOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  };
}

app.use(
  cors({
    origin: buildCorsOrigin(),
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "express-api",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", predictionRoutes);
app.use(express.static(clientRoot));

app.get("*", (req, res) => {
  const indexPath = path.join(clientRoot, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`Failed to send ${indexPath}:`, err.message);
      res.status(404).json({
        error: "Not found",
        path: req.path,
      });
    }
  });
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Unexpected server error",
  });
});

export default app;
