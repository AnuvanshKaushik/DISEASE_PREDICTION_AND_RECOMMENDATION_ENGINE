import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import app from "./app.js";
import { connectDatabase } from "./config/db.js";

dotenv.config();

const PORT = Number(process.env.PORT || 5000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(__dirname, "../../client");

await connectDatabase();

app.listen(PORT, () => {
  console.log(`Express API running on http://localhost:${PORT}`);
  console.log(`Serving client files from: ${clientRoot}`);
});
