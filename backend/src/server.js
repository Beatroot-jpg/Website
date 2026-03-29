import "dotenv/config";
import cors from "cors";
import express from "express";

import { prisma } from "./db.js";
import { ensureInitialAdmin } from "./services/bootstrap.js";
import authRoutes from "./routes/auth.js";
import metaRoutes from "./routes/meta.js";
import userRoutes from "./routes/users.js";
import inventoryRoutes from "./routes/inventory.js";
import bankRoutes from "./routes/bank.js";
import distributionRoutes from "./routes/distribution.js";
import dashboardRoutes from "./routes/dashboard.js";
import rosterRoutes from "./routes/roster.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const host = "0.0.0.0";

const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin is not allowed by CORS."));
    }
  })
);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/meta", metaRoutes);
app.use("/api/users", userRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/bank", bankRoutes);
app.use("/api/distribution", distributionRoutes);
app.use("/api/roster", rosterRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use((error, _req, res, _next) => {
  console.error(error);

  const status = error.status || 500;
  const message = error.message || "Unexpected server error.";
  res.status(status).json({ message });
});

async function startServer() {
  console.log("Connecting to PostgreSQL with Prisma...");
  await prisma.$connect();
  console.log("Database connection established.");

  console.log("Checking bootstrap admin account...");
  await ensureInitialAdmin();
  console.log("Bootstrap check complete.");

  app.listen(port, host, () => {
    console.log(`API listening on http://${host}:${port}.`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server.", error);
  process.exit(1);
});
