import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import predictionRoutes from "./routes/predictionRoutes.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve from server/src to server/.. (project root) to client
const clientRoot = path.resolve(__dirname, "../../client");

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
