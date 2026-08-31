# ✈️ Flight Hunter

Search **many departure airports against many destinations at once** and find the cheapest way to
get there. Built for the case ordinary flight search handles badly: *"I'll fly from any of these
five cities to any of these three, whichever is cheapest — and I'm flexible on dates."*

Runs with **zero API keys** on realistic offline sample data, so you can try the whole thing before
signing up for anything.

---

## Quick start

Run these as two separate commands:

```
npm install
npm run dev
```

Then open **http://localhost:5173**.

That's it — no `.env`, no keys, no database setup. The API runs on port 4000 and the UI proxies to
it automatically.

> **Windows PowerShell:** don't join them with `&&` — Windows PowerShell 5.1 (the default in the
> WebStorm terminal) rejects it with *"The token '&&' is not a valid statement separator"*. Run
> them on separate lines, or use `npm install; npm run dev`.

To use live fares, copy `.env.example` to `.env` and add free
[Amadeus](https://developers.amadeus.com) credentials.

---

## What it does

**Search**
- Any route worldwide — **6,071 airports** with ranked autocomplete by city, airport name or IATA code
- City/metro codes work: `NYC` searches JFK + EWR + LGA, `LON` covers all five London airports
- Many-to-many search — 5 origins × 3 destinations is one click
- **22 route presets** across five categories, plus your own saved corridors
- Nearby-airport expansion: include everything within 100–350 km of your origin
- Flexible dates — a ±7 day price strip showing the cheapest fare per day
- Round trips with **both legs** modelled properly: real durations, stops and routings for each direction

**Price depth**
- Every flight is priced across **three fare families** — Basic, Standard and Flex — with the
  baggage, refundability and change rules that justify the difference. That is where most of a
  route's real price spread lives.
- Result volume is yours to set: from a quick 3 offers per route up to 120. A five-origin search
  at full depth returns well over a thousand distinct prices in under a second.
- Optionally collapse fare families to one row per flight, with the other fares one click away.

**Filters**
- Cabin, stops, price ceiling, total duration, layover length
- Departure *and* arrival time windows, plus a no-red-eye switch
- Airline include/exclude, **alliance** (Star Alliance / SkyTeam / Oneworld), hide low-cost carriers
- Fare family, "checked bag included"
- Connect *via* specific airports, or never route through them
- Maximum flights per leg, independent of stop count

**Ranking**
- **Best value** scoring that weighs price against duration and connections, measured as
  proportional excess over the best option — so a 12% price premium is scored as 12%, not as
  "worst in set"
- Or sort plainly by price, duration, stops, departure or arrival

**Track**
- **Price history** charts, recorded automatically on every search
- **Price alerts** — fire on a target price or a percentage drop, checked in the background
- **Saved searches** for hunts you return to
- **Shareable URLs** — the whole search encodes into the address bar
- **CSV export** of any result set

**Customisation** — a Settings panel that actually changes behaviour
- **Tune what "best value" means**: sliders for price sensitivity, duration sensitivity and the
  penalty per connection. Set price to 1.0 and the ranking becomes pure cheapest-first.
- Defaults for currency, cabin, passengers, stops, flexible dates and sort order
- Result volume and page size
- Comfortable or compact density; show or hide the score, baggage, CO₂ and seats-left
- Light / dark / system theming

**Quality of life**
- Baggage allowance, CO₂ estimate and distance flown on every result
- Pin flights to a compare tray
- Per-provider status: who answered, how fast, what failed, what was served from cache
- Keyboard: `Ctrl`/`⌘`+`Enter` to search, `/` to focus, `Esc` to cancel

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API + UI with hot reload |
| `npm run build` | Production build of all three packages |
| `npm start` | Run the built server |
| `npm test` | Run the test suite (164 tests) |
| `npm run typecheck` | Type-check everything, tests included |

---

## Structure

An npm-workspaces monorepo. The key point is `shared`: request/response types are defined **once**
as Zod schemas and the TypeScript types are inferred from them, so the client and server cannot
drift apart.

```
packages/
  shared/    Zod schemas + inferred types, formatting, geo maths, presets
  server/    Express API
    providers/   Amadeus · Travelpayouts · offline mock (pluggable)
    core/        orchestration, filtering, dedupe, ranking
    data/        6,071-airport dataset + search index
    db/          SQLite schema, migrations, repositories
    jobs/        background alert poller
  client/    React + Vite UI
```

### Adding a data source

Implement `FlightProvider` (three methods) and add it to the list in
`packages/server/src/providers/registry.ts`. Nothing else changes — orchestration, caching,
filtering, dedupe and ranking all work off the normalised shape.

When any real provider is configured the mock is withheld automatically, so sample fares can never
be silently mixed into real results.

---

## Notes

- **Dependencies are deliberately lean.** No charting library, CSS framework, UI kit, state manager
  or HTTP client — the chart is hand-written SVG, the styles are plain CSS, and HTTP uses the
  platform `fetch`. The only native dependency is `better-sqlite3`, which installs a prebuilt binary
  (no compiler required).
- **Search is call-budgeted.** A single search is capped at 400 upstream requests, and flexible-date
  exploration only widens the routes that already look competitive — otherwise 30 origins × 30
  destinations × ±7 days would be 13,500 API calls per click. Raising *offers per route* asks each
  provider for more depth per call rather than making more calls.
- **The sandbox is not real pricing.** With `AMADEUS_BASE_URL` pointing at `test.api.amadeus.com`
  you get sandbox data. The app says so in the UI rather than pretending otherwise.
- Airport data derives from [OpenFlights](https://openflights.org/data.html), licensed under
  [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
