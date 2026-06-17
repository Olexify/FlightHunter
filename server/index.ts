import "dotenv/config";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { runMultiSearch } from "./orchestrator.js";
import { EUROPE_ORIGINS, JAPAN_DESTINATIONS } from "./airportPresets.js";

const app = express();
app.use(cors());
app.use(express.json());

const SearchSchema = z.object({
  origins: z.array(z.string().length(3)).min(1).max(30),
  destinations: z.array(z.string().length(3)).min(1).max(10),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  adults: z.number().int().min(1).max(9).default(1),
  maxStops: z.number().int().min(0).max(5).optional(),
  currency: z.string().length(3).default("EUR"),
  maxPerPair: z.number().int().min(1).max(10).default(5),
});

app.get("/api/presets", (_req, res) => {
  res.json({ europeOrigins: EUROPE_ORIGINS, japanDestinations: JAPAN_DESTINATIONS });
});

app.post("/api/search", async (req, res) => {
  const parsed = SearchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { flights, errors } = await runMultiSearch(parsed.data);
  res.json({ count: flights.length, flights, errors });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`✈️  Flight Hunter API on http://localhost:${port}`));