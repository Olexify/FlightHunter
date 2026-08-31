import { Router, type Response } from "express";
import { z } from "zod";
import {
  ALLIANCE_LABELS,
  COMMON_CURRENCIES,
  CreateAlert,
  CreateCustomPreset,
  CreateSavedSearch,
  DEFAULT_RANKING_WEIGHTS,
  FARE_BRAND_LABELS,
  PRESET_CATEGORY_LABELS,
  ROUTE_PRESETS,
  SearchRequest,
  allAirlines,
} from "@flighthunter/shared";
import { config, configWarnings } from "../config.js";
import { cacheStats, clearSearchCache, runSearch } from "../core/orchestrator.js";
import { airportCount, datasetLicense, getAirport, nearbyAirports, searchAirports } from "../data/airports.js";
import { alerts, customPresets, priceHistory, savedSearches } from "../db/repositories.js";
import { pollAlertsOnce } from "../jobs/alertPoller.js";
import { asyncHandler } from "../middleware/errors.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { activeProviders, allProviders, isMockOnly } from "../providers/registry.js";
import { AppError } from "../util/errors.js";
import { offersToCsv } from "../util/csv.js";

export function createRouter(): Router {
  const router = Router();

  const searchLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_SECONDS * 1000,
    max: config.RATE_LIMIT_MAX_REQUESTS,
  });

  /* ------------------------------- health ------------------------------- */

  router.get("/health", (_req, res) => {
    res.json({
      ok: true,
      uptimeSeconds: Math.round(process.uptime()),
      version: "2.0.0",
    });
  });

  /**
   * Everything the UI needs to configure itself: which providers are live,
   * whether results will be sample data, presets, and the airport count.
   */
  router.get("/meta", (_req, res) => {
    res.json({
      providers: allProviders().map((p) => ({
        id: p.id,
        label: p.label,
        configured: p.isConfigured(),
        active: activeProviders().some((a) => a.id === p.id),
      })),
      mockOnly: isMockOnly(),
      warnings: configWarnings(),
      presets: ROUTE_PRESETS,
      presetCategories: PRESET_CATEGORY_LABELS,
      currencies: COMMON_CURRENCIES,
      // Powers the alliance filter and the airline picker in the UI.
      airlines: allAirlines(),
      alliances: ALLIANCE_LABELS,
      fareBrands: FARE_BRAND_LABELS,
      defaultRankingWeights: DEFAULT_RANKING_WEIGHTS,
      airports: airportCount(),
      dataLicense: datasetLicense(),
      cache: cacheStats(),
    });
  });

  /* --------------------------- custom presets --------------------------- */

  router.get("/presets", (_req, res) => {
    res.json({ builtIn: ROUTE_PRESETS, custom: customPresets.list() });
  });

  router.post("/presets", (req, res) => {
    const { name, origins, destinations } = CreateCustomPreset.parse(req.body);
    res.status(201).json({ preset: customPresets.create(name, origins, destinations) });
  });

  router.delete("/presets/:id", (req, res) => {
    if (!customPresets.remove(req.params.id)) throw AppError.notFound("No such preset");
    res.status(204).end();
  });

  /* ------------------------------ airports ------------------------------ */

  const AirportQuery = z.object({
    q: z.string().default(""),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  });

  router.get("/airports", (req, res) => {
    const { q, limit } = AirportQuery.parse(req.query);
    res.json({ airports: searchAirports(q, limit) });
  });

  router.get("/airports/:iata", (req, res) => {
    const airport = getAirport(req.params.iata);
    if (!airport) throw AppError.notFound(`Unknown airport "${req.params.iata}"`);
    res.json({ airport });
  });

  const NearbyQuery = z.object({
    radiusKm: z.coerce.number().int().min(1).max(500).default(150),
    limit: z.coerce.number().int().min(1).max(20).default(5),
  });

  router.get("/airports/:iata/nearby", (req, res) => {
    const { radiusKm, limit } = NearbyQuery.parse(req.query);
    if (!getAirport(req.params.iata)) {
      throw AppError.notFound(`Unknown airport "${req.params.iata}"`);
    }
    res.json({ airports: nearbyAirports(req.params.iata, radiusKm, limit) });
  });

  /* ------------------------------- search ------------------------------- */

  /**
   * Abort upstream work when the client disconnects early.
   *
   * Watches the RESPONSE, not the request: `req`'s "close" fires once the body
   * has been consumed, which would abort every search the moment it started.
   * `writableFinished` distinguishes a real disconnect from a normal reply.
   */
  function signalFor(res: Response): AbortSignal {
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
    return controller.signal;
  }

  router.post(
    "/search",
    searchLimiter,
    asyncHandler(async (req, res) => {
      const parsed = SearchRequest.parse(req.body);
      const result = await runSearch(parsed, {
        signal: signalFor(res),
        onResults: (offers) => {
          try {
            priceHistory.recordSearch(offers);
          } catch {
            // History is a nice-to-have; never fail a search because of it.
          }
        },
      });
      res.json(result);
    }),
  );

  router.post(
    "/search/export",
    searchLimiter,
    asyncHandler(async (req, res) => {
      const parsed = SearchRequest.parse(req.body);
      const result = await runSearch(parsed, { signal: signalFor(res) });
      const csv = offersToCsv(result.offers);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="flighthunter-${parsed.departureDate}.csv"`,
      );
      res.send(csv);
    }),
  );

  router.post("/search/cache/clear", (_req, res) => {
    clearSearchCache();
    res.json({ ok: true });
  });

  /* --------------------------- saved searches --------------------------- */

  router.get("/saved", (_req, res) => {
    res.json({ saved: savedSearches.list() });
  });

  router.post("/saved", (req, res) => {
    const { name, request } = CreateSavedSearch.parse(req.body);
    res.status(201).json({ saved: savedSearches.create(name, request) });
  });

  router.delete("/saved/:id", (req, res) => {
    if (!savedSearches.remove(req.params.id)) throw AppError.notFound("No such saved search");
    res.status(204).end();
  });

  /* ------------------------------- alerts ------------------------------- */

  router.get("/alerts", (_req, res) => {
    res.json({ alerts: alerts.list(), events: alerts.events(25) });
  });

  router.post("/alerts", (req, res) => {
    const input = CreateAlert.parse(req.body);
    res.status(201).json({ alert: alerts.create(input) });
  });

  const PatchAlert = z.object({ active: z.boolean() });

  router.patch("/alerts/:id", (req, res) => {
    const { active } = PatchAlert.parse(req.body);
    if (!alerts.setActive(req.params.id, active)) throw AppError.notFound("No such alert");
    res.json({ alert: alerts.get(req.params.id) });
  });

  router.delete("/alerts/:id", (req, res) => {
    if (!alerts.remove(req.params.id)) throw AppError.notFound("No such alert");
    res.status(204).end();
  });

  router.post("/alerts/acknowledge", (_req, res) => {
    res.json({ acknowledged: alerts.acknowledgeEvents() });
  });

  /** Manual sweep, so the feature is usable without waiting for the interval. */
  router.post(
    "/alerts/poll",
    asyncHandler(async (_req, res) => {
      res.json(await pollAlertsOnce());
    }),
  );

  /* ------------------------------- history ------------------------------ */

  const HistoryQuery = z.object({
    origin: z.string().length(3),
    destination: z.string().length(3),
    departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(500),
  });

  router.get("/history", (req, res) => {
    const q = HistoryQuery.parse(req.query);
    res.json({
      points: priceHistory.forRoute(
        q.origin.toUpperCase(),
        q.destination.toUpperCase(),
        q.departureDate,
        q.limit,
      ),
    });
  });

  router.get("/history/routes", (_req, res) => {
    res.json({ routes: priceHistory.routes() });
  });

  return router;
}
