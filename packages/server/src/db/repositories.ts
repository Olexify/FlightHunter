import { randomUUID } from "node:crypto";
import type {
  Alert,
  CustomPreset,
  FlightOffer,
  PricePoint,
  SavedSearch,
  SearchRequest,
} from "@flighthunter/shared";
import { getDb } from "./index.js";

/* ------------------------------------------------------------------ */
/* Price history                                                       */
/* ------------------------------------------------------------------ */

interface PriceRow {
  origin: string;
  destination: string;
  departure_date: string;
  currency: string;
  price: number;
  observed_at: string;
}

export const priceHistory = {
  /**
   * Record the cheapest offer per route from a completed search. Storing only
   * the minimum keeps the table small while still charting the useful signal.
   */
  recordSearch(offers: FlightOffer[]): number {
    if (offers.length === 0) return 0;

    const cheapest = new Map<string, FlightOffer>();
    for (const o of offers) {
      const out = o.itineraries.find((i) => i.direction === "outbound") ?? o.itineraries[0];
      if (!out) continue;
      const key = `${o.origin}|${o.destination}|${out.departureAt.slice(0, 10)}`;
      const prev = cheapest.get(key);
      if (!prev || o.price.total < prev.price.total) cheapest.set(key, o);
    }

    const db = getDb();
    const stmt = db.prepare(
      `INSERT INTO price_history (origin, destination, departure_date, currency, price, observed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const observedAt = new Date().toISOString();

    const insertAll = db.transaction((rows: FlightOffer[]) => {
      for (const o of rows) {
        const out = o.itineraries.find((i) => i.direction === "outbound") ?? o.itineraries[0];
        if (!out) continue;
        stmt.run(
          o.origin,
          o.destination,
          out.departureAt.slice(0, 10),
          o.price.currency,
          o.price.total,
          observedAt,
        );
      }
    });

    const rows = [...cheapest.values()];
    insertAll(rows);
    return rows.length;
  },

  /** Observations for one route, oldest first. */
  forRoute(origin: string, destination: string, departureDate?: string, limit = 500): PricePoint[] {
    const db = getDb();
    const rows = departureDate
      ? db
          .prepare<[string, string, string, number], PriceRow>(
            `SELECT * FROM price_history
             WHERE origin = ? AND destination = ? AND departure_date = ?
             ORDER BY observed_at ASC LIMIT ?`,
          )
          .all(origin, destination, departureDate, limit)
      : db
          .prepare<[string, string, number], PriceRow>(
            `SELECT * FROM price_history
             WHERE origin = ? AND destination = ?
             ORDER BY observed_at ASC LIMIT ?`,
          )
          .all(origin, destination, limit);

    return rows.map((r) => ({
      observedAt: r.observed_at,
      price: r.price,
      currency: r.currency,
      origin: r.origin,
      destination: r.destination,
      departureDate: r.departure_date,
    }));
  },

  /** Distinct routes we have data for, most-observed first. */
  routes(limit = 50): Array<{ origin: string; destination: string; observations: number; cheapest: number }> {
    return getDb()
      .prepare<[number], { origin: string; destination: string; observations: number; cheapest: number }>(
        `SELECT origin, destination, COUNT(*) AS observations, MIN(price) AS cheapest
         FROM price_history
         GROUP BY origin, destination
         ORDER BY observations DESC
         LIMIT ?`,
      )
      .all(limit);
  },

  /** Trim observations older than `days` to keep the file bounded. */
  prune(days = 180): number {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    return getDb().prepare("DELETE FROM price_history WHERE observed_at < ?").run(cutoff).changes;
  },
};

/* ------------------------------------------------------------------ */
/* Saved searches                                                      */
/* ------------------------------------------------------------------ */

interface SavedRow {
  id: string;
  name: string;
  request: string;
  created_at: string;
  last_run_at: string | null;
  last_cheapest: number | null;
}

const toSaved = (r: SavedRow): SavedSearch => ({
  id: r.id,
  name: r.name,
  request: JSON.parse(r.request) as unknown,
  createdAt: r.created_at,
  lastRunAt: r.last_run_at,
  lastCheapest: r.last_cheapest,
});

export const savedSearches = {
  list(): SavedSearch[] {
    return getDb()
      .prepare<[], SavedRow>("SELECT * FROM saved_searches ORDER BY created_at DESC")
      .all()
      .map(toSaved);
  },

  get(id: string): SavedSearch | undefined {
    const row = getDb().prepare<[string], SavedRow>("SELECT * FROM saved_searches WHERE id = ?").get(id);
    return row ? toSaved(row) : undefined;
  },

  create(name: string, request: SearchRequest): SavedSearch {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    getDb()
      .prepare("INSERT INTO saved_searches (id, name, request, created_at) VALUES (?, ?, ?, ?)")
      .run(id, name, JSON.stringify(request), createdAt);
    return { id, name, request, createdAt, lastRunAt: null, lastCheapest: null };
  },

  touch(id: string, cheapest: number | null): void {
    getDb()
      .prepare("UPDATE saved_searches SET last_run_at = ?, last_cheapest = ? WHERE id = ?")
      .run(new Date().toISOString(), cheapest, id);
  },

  remove(id: string): boolean {
    return getDb().prepare("DELETE FROM saved_searches WHERE id = ?").run(id).changes > 0;
  },
};

/* ------------------------------------------------------------------ */
/* Custom presets                                                      */
/* ------------------------------------------------------------------ */

interface PresetRow {
  id: string;
  name: string;
  origins: string;
  destinations: string;
  created_at: string;
}

const toPreset = (r: PresetRow): CustomPreset => ({
  id: r.id,
  name: r.name,
  // Stored as comma-joined IATA codes; filter guards against a stray empty.
  origins: r.origins.split(",").filter(Boolean),
  destinations: r.destinations.split(",").filter(Boolean),
  createdAt: r.created_at,
});

export const customPresets = {
  list(): CustomPreset[] {
    return getDb()
      .prepare<[], PresetRow>("SELECT * FROM custom_presets ORDER BY created_at DESC")
      .all()
      .map(toPreset);
  },

  create(name: string, origins: string[], destinations: string[]): CustomPreset {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    getDb()
      .prepare(
        "INSERT INTO custom_presets (id, name, origins, destinations, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, name, origins.join(","), destinations.join(","), createdAt);
    return { id, name, origins, destinations, createdAt };
  },

  remove(id: string): boolean {
    return getDb().prepare("DELETE FROM custom_presets WHERE id = ?").run(id).changes > 0;
  },
};

/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */

interface AlertRow {
  id: string;
  name: string;
  request: string;
  target_price: number | null;
  drop_percent: number | null;
  currency: string;
  active: number;
  created_at: string;
  last_checked_at: string | null;
  last_price: number | null;
  baseline_price: number | null;
  triggered_at: string | null;
}

const toAlert = (r: AlertRow): Alert => ({
  id: r.id,
  name: r.name,
  request: JSON.parse(r.request) as unknown,
  targetPrice: r.target_price,
  dropPercent: r.drop_percent,
  currency: r.currency,
  active: r.active === 1,
  createdAt: r.created_at,
  lastCheckedAt: r.last_checked_at,
  lastPrice: r.last_price,
  baselinePrice: r.baseline_price,
  triggeredAt: r.triggered_at,
});

export interface AlertEvent {
  id: number;
  alertId: string;
  price: number;
  previousPrice: number | null;
  currency: string;
  message: string;
  createdAt: string;
  acknowledged: boolean;
}

export const alerts = {
  list(): Alert[] {
    return getDb()
      .prepare<[], AlertRow>("SELECT * FROM alerts ORDER BY created_at DESC")
      .all()
      .map(toAlert);
  },

  active(): Alert[] {
    return getDb()
      .prepare<[], AlertRow>("SELECT * FROM alerts WHERE active = 1 ORDER BY created_at ASC")
      .all()
      .map(toAlert);
  },

  get(id: string): Alert | undefined {
    const row = getDb().prepare<[string], AlertRow>("SELECT * FROM alerts WHERE id = ?").get(id);
    return row ? toAlert(row) : undefined;
  },

  create(input: {
    name: string;
    request: SearchRequest;
    targetPrice: number | null;
    dropPercent: number | null;
  }): Alert {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO alerts (id, name, request, target_price, drop_percent, currency, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(
        id,
        input.name,
        JSON.stringify(input.request),
        input.targetPrice,
        input.dropPercent,
        input.request.currency,
        createdAt,
      );

    return {
      id,
      name: input.name,
      request: input.request,
      targetPrice: input.targetPrice,
      dropPercent: input.dropPercent,
      currency: input.request.currency,
      active: true,
      createdAt,
      lastCheckedAt: null,
      lastPrice: null,
      baselinePrice: null,
      triggeredAt: null,
    };
  },

  setActive(id: string, active: boolean): boolean {
    return (
      getDb().prepare("UPDATE alerts SET active = ? WHERE id = ?").run(active ? 1 : 0, id).changes > 0
    );
  },

  remove(id: string): boolean {
    return getDb().prepare("DELETE FROM alerts WHERE id = ?").run(id).changes > 0;
  },

  /** Persist the outcome of a poll. Baseline is seeded on the first check. */
  recordCheck(
    id: string,
    price: number | null,
    opts: { triggered: boolean; seedBaseline: boolean },
  ): void {
    const db = getDb();
    const now = new Date().toISOString();

    if (opts.seedBaseline && price !== null) {
      db.prepare(
        `UPDATE alerts SET last_checked_at = ?, last_price = ?, baseline_price = ? WHERE id = ?`,
      ).run(now, price, price, id);
      return;
    }
    if (opts.triggered) {
      db.prepare(
        `UPDATE alerts SET last_checked_at = ?, last_price = ?, triggered_at = ? WHERE id = ?`,
      ).run(now, price, now, id);
      return;
    }
    db.prepare("UPDATE alerts SET last_checked_at = ?, last_price = ? WHERE id = ?").run(now, price, id);
  },

  addEvent(input: {
    alertId: string;
    price: number;
    previousPrice: number | null;
    currency: string;
    message: string;
  }): void {
    getDb()
      .prepare(
        `INSERT INTO alert_events (alert_id, price, previous_price, currency, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.alertId,
        input.price,
        input.previousPrice,
        input.currency,
        input.message,
        new Date().toISOString(),
      );
  },

  events(limit = 50): AlertEvent[] {
    return getDb()
      .prepare<
        [number],
        {
          id: number;
          alert_id: string;
          price: number;
          previous_price: number | null;
          currency: string;
          message: string;
          created_at: string;
          acknowledged: number;
        }
      >("SELECT * FROM alert_events ORDER BY created_at DESC LIMIT ?")
      .all(limit)
      .map((r) => ({
        id: r.id,
        alertId: r.alert_id,
        price: r.price,
        previousPrice: r.previous_price,
        currency: r.currency,
        message: r.message,
        createdAt: r.created_at,
        acknowledged: r.acknowledged === 1,
      }));
  },

  acknowledgeEvents(): number {
    return getDb().prepare("UPDATE alert_events SET acknowledged = 1 WHERE acknowledged = 0").run()
      .changes;
  },
};
