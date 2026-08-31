import { SearchRequest } from "@flighthunter/shared";
import { formatPrice } from "@flighthunter/shared";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { runSearch } from "../core/orchestrator.js";
import { alerts, priceHistory } from "../db/repositories.js";

/**
 * Background price watcher. Re-runs each active alert's search on an interval
 * and records an event when the fare hits the target or falls far enough below
 * the baseline captured on the first check.
 */

let timer: NodeJS.Timeout | null = null;
let running = false;

export interface PollSummary {
  checked: number;
  triggered: number;
  failed: number;
}

/** Decide whether an alert should fire, and describe why. */
export function evaluateAlert(input: {
  price: number;
  targetPrice: number | null;
  dropPercent: number | null;
  baselinePrice: number | null;
  currency: string;
}): { triggered: boolean; message: string } {
  const { price, targetPrice, dropPercent, baselinePrice, currency } = input;

  if (targetPrice !== null && price <= targetPrice) {
    return {
      triggered: true,
      message: `Price ${formatPrice(price, currency)} reached your target of ${formatPrice(targetPrice, currency)}`,
    };
  }

  if (dropPercent !== null && baselinePrice !== null && baselinePrice > 0) {
    const drop = ((baselinePrice - price) / baselinePrice) * 100;
    if (drop >= dropPercent) {
      return {
        triggered: true,
        message: `Price fell ${drop.toFixed(1)}% from ${formatPrice(baselinePrice, currency)} to ${formatPrice(price, currency)}`,
      };
    }
  }

  return { triggered: false, message: "" };
}

export async function pollAlertsOnce(): Promise<PollSummary> {
  const summary: PollSummary = { checked: 0, triggered: 0, failed: 0 };
  const list = alerts.active();
  if (list.length === 0) return summary;

  for (const alert of list) {
    summary.checked++;
    try {
      // Requests are re-validated on read: a stored alert may predate a schema change.
      const parsed = SearchRequest.safeParse(alert.request);
      if (!parsed.success) {
        logger.warn(`alert ${alert.id} has an unreadable request, deactivating`);
        alerts.setActive(alert.id, false);
        summary.failed++;
        continue;
      }

      const result = await runSearch(parsed.data, {
        onResults: (offers) => priceHistory.recordSearch(offers),
      });

      const cheapest = result.offers[0]?.price.total ?? null;
      if (cheapest === null) {
        alerts.recordCheck(alert.id, null, { triggered: false, seedBaseline: false });
        continue;
      }

      // First successful check establishes the baseline rather than firing.
      if (alert.baselinePrice === null) {
        alerts.recordCheck(alert.id, cheapest, { triggered: false, seedBaseline: true });
        continue;
      }

      const verdict = evaluateAlert({
        price: cheapest,
        targetPrice: alert.targetPrice,
        dropPercent: alert.dropPercent,
        baselinePrice: alert.baselinePrice,
        currency: alert.currency,
      });

      if (verdict.triggered) {
        alerts.addEvent({
          alertId: alert.id,
          price: cheapest,
          previousPrice: alert.lastPrice,
          currency: alert.currency,
          message: verdict.message,
        });
        alerts.recordCheck(alert.id, cheapest, { triggered: true, seedBaseline: false });
        summary.triggered++;
        logger.info(`alert "${alert.name}" triggered`, { price: cheapest });
      } else {
        alerts.recordCheck(alert.id, cheapest, { triggered: false, seedBaseline: false });
      }
    } catch (err) {
      summary.failed++;
      logger.warn(`alert ${alert.id} check failed`, {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}

export function startAlertPoller(): void {
  if (config.ALERT_POLL_MINUTES <= 0) {
    logger.info("alert poller disabled (set ALERT_POLL_MINUTES to enable)");
    return;
  }
  const intervalMs = config.ALERT_POLL_MINUTES * 60_000;

  const tick = async (): Promise<void> => {
    // Skip rather than overlap if a previous sweep is still going.
    if (running) return;
    running = true;
    try {
      const summary = await pollAlertsOnce();
      if (summary.checked > 0) logger.info("alert sweep complete", summary);
    } catch (err) {
      logger.error("alert sweep failed", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => void tick(), intervalMs);
  // Never hold the process open just for polling.
  timer.unref();
  logger.info(`alert poller running every ${config.ALERT_POLL_MINUTES} min`);
}

export function stopAlertPoller(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
