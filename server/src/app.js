import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import predictionRoutes from "./routes/predictionRoutes.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const clientRoot = path.join(projectRoot, "client");

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || true,
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

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    next();
    return;
  }

  res.sendFile(path.join(clientRoot, "index.html"));
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Unexpected server error",
  });
});

export default app;
