import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `npm run doctor` — checks whether live flight data is actually working.
 *
 * It drives the real provider classes rather than reimplementing the requests,
 * so a pass here means the normalisation the app depends on is correct too, not
 * merely that the credentials authenticate.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const envPath = resolve(repoRoot, ".env");
const examplePath = resolve(repoRoot, ".env.example");

/* A missing .env is the usual cause, so offer the fix before anything else. */
if (!existsSync(envPath) && existsSync(examplePath)) {
  copyFileSync(examplePath, envPath);
  console.log(`\n  Created .env from .env.example — fill in your keys and run this again.\n`);
}

// Imported after the copy above so dotenv reads the file we may have just made.
const { config, configWarnings } = await import("./config.js");
const { AmadeusProvider, describeAmadeusError } = await import("./providers/amadeus.js");
const { TravelpayoutsProvider } = await import("./providers/travelpayouts.js");
const { SearchRequest } = await import("@flighthunter/shared");
const { formatDuration } = await import("@flighthunter/shared");

const ok = (s: string) => `  [ok]   ${s}`;
const bad = (s: string) => `  [FAIL] ${s}`;
const info = (s: string) => `  [--]   ${s}`;

/** Never print a secret in full, but show enough to spot a paste error. */
function mask(value: string | undefined): string {
  if (!value) return "missing";
  if (value.length <= 8) return `set (${value.length} chars)`;
  return `set (${value.slice(0, 4)}…${value.slice(-2)}, ${value.length} chars)`;
}

/** A future date, so the search is not rejected for being in the past. */
function inSixtyDays(): string {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const departureDate = inSixtyDays();
const request = SearchRequest.parse({
  origins: ["WAW"],
  destinations: ["NRT"],
  departureDate,
  maxPerPair: 5,
});
const pair = { origin: "WAW", destination: "NRT", departureDate };

console.log("\n  Flight Hunter — provider check");
console.log("  ==================================================\n");

console.log("  Configuration");
console.log(`${existsSync(envPath) ? ok(".env found") : bad(".env missing")}`);
console.log(info(`AMADEUS_CLIENT_ID      ${mask(config.AMADEUS_CLIENT_ID)}`));
console.log(info(`AMADEUS_CLIENT_SECRET  ${mask(config.AMADEUS_CLIENT_SECRET)}`));
console.log(info(`AMADEUS_BASE_URL       ${config.AMADEUS_BASE_URL}`));
console.log(info(`TRAVELPAYOUTS_TOKEN    ${mask(config.TRAVELPAYOUTS_TOKEN)}`));

for (const w of configWarnings()) console.log(info(w));
console.log("");

let anyLive = false;
/** Only a CONFIGURED provider that failed is an error worth a non-zero exit. */
let anyFailure = false;

/* -------------------------------- Amadeus -------------------------------- */

console.log(`  Amadeus — real search ${pair.origin} to ${pair.destination} on ${departureDate}`);

if (!config.hasAmadeus) {
  console.log(info("skipped: no credentials"));
  console.log(info("free self-service keys: https://developers.amadeus.com (no card needed)"));
} else {
  try {
    const offers = await new AmadeusProvider().search(pair, request, {});
    anyLive = true;

    if (offers.length === 0) {
      console.log(ok("authenticated, but this route returned no offers"));
      console.log(info("the sandbox only covers some routes — try a busier one, e.g. LHR to JFK"));
    } else {
      console.log(ok(`${offers.length} live offers returned and normalised`));
      for (const o of offers.slice(0, 3)) {
        const legs = o.itineraries
          .map((it) => `${it.stops === 0 ? "direct" : `${it.stops} stop`} ${formatDuration(it.durationMinutes)}`)
          .join(" / ");
        console.log(
          `           ${String(Math.round(o.price.total)).padStart(6)} ${o.price.currency}  ` +
            `${o.airlines.map((a) => a.code).join(",").padEnd(8)} ${legs}`,
        );
      }
      // The normalisation is what unit tests could not prove against fixtures.
      const broken = offers.filter(
        (o) => o.itineraries.length === 0 || o.totalDurationMinutes <= 0 || o.airlines.length === 0,
      );
      console.log(
        broken.length === 0
          ? ok("every offer has itineraries, a duration and a carrier")
          : bad(`${broken.length} offer(s) normalised badly — please report this`),
      );
    }
  } catch (err) {
    anyFailure = true;
    const message = describeAmadeusError(err);
    console.log(bad(message));
    if (message.includes("401") || /invalid.client/i.test(message)) {
      console.log(info("that is an authentication failure — re-copy both key and secret"));
    } else if (message.includes("429")) {
      console.log(info("rate limited — the free tier allows about 10 requests/second"));
    } else if (/ENOTFOUND|fetch failed|timed out/i.test(message)) {
      console.log(info("network problem — check connectivity or a proxy/firewall"));
    }
  }
}
console.log("");

/* ----------------------------- Travelpayouts ----------------------------- */

console.log("  Travelpayouts");

if (!config.hasTravelpayouts) {
  console.log(info("skipped: no token"));
  console.log(info("free token: https://travelpayouts.com (Profile then API access)"));
} else {
  try {
    const offers = await new TravelpayoutsProvider().search(pair, request, {});
    anyLive = true;
    console.log(
      offers.length > 0
        ? ok(`${offers.length} cached fares returned`)
        : ok("responded, but had no cached fares for this route"),
    );
    for (const o of offers.slice(0, 3)) {
      console.log(
        `           ${String(Math.round(o.price.total)).padStart(6)} ${o.price.currency}  ` +
          `${o.airlines.map((a) => a.code).join(",")}`,
      );
    }
  } catch (err) {
    anyFailure = true;
    console.log(bad(err instanceof Error ? err.message : String(err)));
  }
}

/* -------------------------------- verdict -------------------------------- */

console.log("\n  ==================================================");
if (anyLive) {
  console.log("  Live data is working. Restart the app and the");
  console.log("  'sample data' banner will be gone.\n");
} else {
  console.log("  No live provider is configured, so the app will keep");
  console.log("  showing simulated fares. Add keys to .env and rerun.\n");
}

// Exit non-zero only when something is genuinely broken, so "no keys yet"
// does not make npm print a failure block over a working diagnostic.
process.exit(anyFailure ? 1 : 0);
