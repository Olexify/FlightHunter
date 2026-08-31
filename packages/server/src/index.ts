import { createApp } from "./app.js";
import { config, configWarnings } from "./config.js";
import { logger } from "./logger.js";
import { airportCount } from "./data/airports.js";
import { closeDb, getDb } from "./db/index.js";
import { startAlertPoller, stopAlertPoller } from "./jobs/alertPoller.js";
import { activeProviders } from "./providers/registry.js";

function main(): void {
  // Touch the database at boot so a bad path fails here, not mid-request.
  getDb();

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info(`Flight Hunter API listening on http://localhost:${config.PORT}`);
    logger.info(`${airportCount()} airports loaded`);
    logger.info(`providers: ${activeProviders().map((p) => p.label).join(", ")}`);
    for (const warning of configWarnings()) logger.warn(warning);
  });

  startAlertPoller();

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received, shutting down`);
    stopAlertPoller();
    server.close(() => {
      closeDb();
      process.exit(0);
    });
    // Do not hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 8000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    logger.error("unhandled promise rejection", {
      message: reason instanceof Error ? reason.message : String(reason),
    });
  });
}

main();
