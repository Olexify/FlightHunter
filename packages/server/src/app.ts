import express, { type Express } from "express";
import cors from "cors";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { createRouter } from "./routes/index.js";

/** Builds the app without listening, so tests can drive it directly. */
export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  // Needed for correct client IPs (and thus rate limiting) behind a proxy.
  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: config.corsOrigins === "*" ? true : config.corsOrigins,
      credentials: false,
    }),
  );
  app.use(express.json({ limit: "256kb" }));

  if (config.LOG_LEVEL === "debug") {
    app.use((req, _res, next) => {
      logger.debug(`${req.method} ${req.originalUrl}`);
      next();
    });
  }

  app.use("/api", createRouter());
  // Keep the legacy path working for anyone with an old bookmark.
  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
