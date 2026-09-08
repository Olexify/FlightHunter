# ✈️ Flight Hunter

Search **many departure airports against many destinations at once** and find the cheapest way to
get there. Built for the case ordinary flight search handles badly: *"I'll fly from any of these
five cities to any of these three, whichever is cheapest — and I'm flexible on dates."*

Runs with **zero API keys** on realistic offline sample data, so you can try the whole thing before
signing up for anything.

---

## Quick start

**Windows:** double-click **`FlightHunter.bat`**. It installs and builds on first run, starts the
app, and opens your browser at **http://localhost:4000**. Later launches skip straight to starting.
Keep the window open while you use it; closing it stops the server.

For a proper shortcut with an icon, in the project folder and on your desktop:

```
powershell -ExecutionPolicy Bypass -File scripts\create-shortcuts.ps1
```

Shortcuts store an absolute path, so they are machine-specific and not committed — rerun that
script after cloning, or if you move the project folder.

Otherwise, run these as two separate commands:

```
npm install
npm run dev
```

Then open **http://localhost:5173**.

Either way — no `.env`, no keys, no database setup.

> **Windows PowerShell:** don't join them with `&&` — Windows PowerShell 5.1 (the default in the
> WebStorm terminal) rejects it with *"The token '&&' is not a valid statement separator"*. Run
> them on separate lines, or use `npm install; npm run dev`.

### Two ways to run

| | Port | Hot reload | Use it for |
|---|---|---|---|
| `FlightHunter.bat` / `npm run build` + `npm start` | **4000** | no | everyday use — one process serves the UI and the API |
| `FlightHunter.bat dev` / `npm run dev` | **5173** | yes | editing the code |

After changing source, rerun `npm run build` (or delete `packages/client/dist`) so the launcher
picks the change up.

---

## Getting real prices

**Out of the box every fare is simulated.** The `mock` badge on each row and the banner across the
top say so — nothing here is bookable until you add a provider key.

Two free sources drop straight in, neither needs a card:

| Provider | What you get | Sign up |
|---|---|---|
| **Amadeus Self-Service** | Real flight offers with full routing. The default `test` host returns sandbox pricing on a subset of routes; switch `AMADEUS_BASE_URL` to `https://api.amadeus.com` for production fares. | [developers.amadeus.com](https://developers.amadeus.com) |
| **Travelpayouts** | Cached real-world fares plus booking links. No routing detail — the app labels those results accordingly. | [travelpayouts.com](https://travelpayouts.com) |

Put the keys in `.env` (run `npm run doctor` once and it creates the file for you), then:

```
npm run doctor
```

That drives the **real provider code** against the live API — it authenticates, runs an actual
search, and prints the fares it got back, so a pass proves the whole path works rather than just
that the credentials are valid. It names the specific problem when something is wrong: a 401 means
the key is mistyped, a 429 means you hit the rate limit.

Once a real provider is configured the mock is withheld entirely, so simulated fares can never be
mixed into live results.

> **Scraping airline or comparison sites is not supported and won't be added.** Google Flights,
> Skyscanner and Kayak sit behind bot protection, serve deliberately obfuscated payloads that change
> without notice, and prohibit it in their terms. It breaks constantly and gets your IP banned. The
> provider API route is both legal and far less work.

---

## What it does

**Explore — "where can I go for €400?"**
- Fix a budget and a departure point; get destinations back instead of fares
- Filter by region, flight time, minimum distance and stops; sort by price, distance or duration
- One card per destination (the cheapest way to reach it), and clicking one hands the route
  straight to the full search with its dates already filled in
- Prices ~40 candidate destinations in well under a second

**Search**
- Any route worldwide — **6,072 airports** with ranked autocomplete by city, airport name or IATA code
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
| `npm test` | Run the test suite (248 tests) |
| `npm run doctor` | Check whether live provider keys actually work |
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
    data/        6,072-airport dataset + search index
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
- **Rate limiting keys on the client IP**, so `TRUST_PROXY` defaults to off. Turn it on only behind
  a proxy you control — with it on, Express reads the IP from a header the caller can set, which
  would hand anyone a rate-limit bypass.
- Airport data derives from [OpenFlights](https://openflights.org/data.html), licensed under
  [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The snapshot predates a few airport
  changes, so `packages/server/src/data/airports.ts` carries a small corrections list — it adds
  Berlin Brandenburg (BER, opened 2020) and retires TXL, SXF and THF. A test asserts every preset
  and metro code resolves against the shipped dataset, because a missing code fails silently.
