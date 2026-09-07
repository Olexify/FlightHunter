import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import cors from "cors";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { createRouter } from "./routes/index.js";

/**
 * Location of the built UI, resolved relative to this file rather than the
 * working directory so it is found however the server was launched.
 * src/app.ts and dist/app.js are both one level below the package root.
 */
function clientDistDir(): string {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  return join(packageRoot, "..", "client", "dist");
}

/** Builds the app without listening, so tests can drive it directly. */
export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  // Opt-in only. With this on, req.ip comes from X-Forwarded-For, which the
  // client controls — so trusting it while directly exposed hands anyone a
  // rate-limit bypass. Enable TRUST_PROXY only behind your own proxy.
  app.set("trust proxy", config.TRUST_PROXY ? 1 : false);

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

  /**
   * Serve the built UI when one exists, so `npm start` gives a complete app on
   * a single port. In development the Vite dev server handles this instead and
   * proxies /api here, so the absence of a build is normal, not an error.
   */
  const dist = clientDistDir();
  if (existsSync(join(dist, "index.html"))) {
    app.use(express.static(dist, { index: false, maxAge: "1h" }));

    // SPA fallback — but never for /api, which must still 404 as JSON rather
    // than quietly returning the HTML shell.
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(join(dist, "index.html"));
    });
    logger.info("serving built UI from packages/client/dist");
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
