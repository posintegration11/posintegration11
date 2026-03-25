import express from "express";
import cors from "cors";
import { getEnv } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.routes.js";
import { tablesRouter } from "./routes/tables.routes.js";
import { menuRouter } from "./routes/menu.routes.js";
import { ordersRouter } from "./routes/orders.routes.js";
import { kotRouter } from "./routes/kot.routes.js";
import { billingRouter } from "./routes/billing.routes.js";
import { reportsRouter } from "./routes/reports.routes.js";
import { settingsRouter } from "./routes/settings.routes.js";
import { usersRouter } from "./routes/users.routes.js";

export function createApp() {
  const app = express();
  const env = getEnv();

  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true,
    })
  );
  /** Default 100kb is too small for base64 shop logos on PUT /settings */
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/tables", tablesRouter);
  app.use("/api/v1/menu", menuRouter);
  app.use("/api/v1/orders", ordersRouter);
  app.use("/api/v1/kot", kotRouter);
  app.use("/api/v1/billing", billingRouter);
  app.use("/api/v1/reports", reportsRouter);
  app.use("/api/v1/settings", settingsRouter);
  app.use("/api/v1/users", usersRouter);

  app.use(errorHandler);
  return app;
}
