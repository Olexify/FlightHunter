import "dotenv/config";
import { z } from "zod";

/**
 * Environment is validated once at boot and the result is frozen. A bad or
 * half-filled `.env` fails immediately with a readable message instead of
 * surfacing as a confusing 500 on the first search.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),

  AMADEUS_CLIENT_ID: z.string().trim().min(1).optional(),
  AMADEUS_CLIENT_SECRET: z.string().trim().min(1).optional(),
  AMADEUS_BASE_URL: z.string().url().default("https://test.api.amadeus.com"),

  TRAVELPAYOUTS_TOKEN: z.string().trim().min(1).optional(),
  TRAVELPAYOUTS_MARKER: z.string().trim().optional(),

  DATABASE_PATH: z.string().default("./data/flighthunter.db"),

  /** Cached search results stay usable this long. */
  CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(15 * 60),
  CACHE_MAX_ENTRIES: z.coerce.number().int().min(16).default(500),

  /** Concurrent upstream provider calls. Amadeus test tier allows ~10 req/s. */
  PROVIDER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1000).default(20_000),

  /** Per-IP request budget for the search endpoint. */
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(30),

  /** Background alert polling. 0 disables the scheduler entirely. */
  ALERT_POLL_MINUTES: z.coerce.number().int().min(0).default(0),

  /** Comma-separated allowed origins, or `*`. */
  CORS_ORIGINS: z.string().default("http://localhost:5173"),

  /**
   * Only enable behind a proxy you actually control.
   *
   * Express derives `req.ip` from the client-supplied X-Forwarded-For header
   * when this is on, which is what the rate limiter keys on. Left on by
   * default — as it was — any caller can spoof the header and bypass rate
   * limiting entirely, so it defaults to off.
   */
  TRUST_PROXY: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
});

export type AppConfig = Readonly<
  z.infer<typeof EnvSchema> & {
    hasAmadeus: boolean;
    hasTravelpayouts: boolean;
    corsOrigins: string[] | "*";
  }
>;

function build(): AppConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  const env = parsed.data;

  // Amadeus needs *both* halves; one alone is a misconfiguration, not a
  // partial capability, so treat it as absent and say so at startup.
  const hasAmadeus = Boolean(env.AMADEUS_CLIENT_ID && env.AMADEUS_CLIENT_SECRET);

  const corsOrigins =
    env.CORS_ORIGINS.trim() === "*"
      ? ("*" as const)
      : env.CORS_ORIGINS.split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  return Object.freeze({
    ...env,
    hasAmadeus,
    hasTravelpayouts: Boolean(env.TRAVELPAYOUTS_TOKEN),
    corsOrigins,
  });
}

export const config: AppConfig = build();

/** Human-readable notes shown once at boot and via `/api/health`. */
export function configWarnings(c: AppConfig = config): string[] {
  const out: string[] = [];
  const halfAmadeus =
    Boolean(c.AMADEUS_CLIENT_ID) !== Boolean(c.AMADEUS_CLIENT_SECRET);

  if (halfAmadeus) {
    out.push(
      "Amadeus is half-configured: set BOTH AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET. Falling back to mock data.",
    );
  } else if (!c.hasAmadeus) {
    out.push("No Amadeus credentials — live pricing is off. Add keys from developers.amadeus.com to enable it.");
  }
  if (!c.hasTravelpayouts) {
    out.push("No Travelpayouts token — the cached-fares provider is disabled.");
  }
  if (c.hasAmadeus && c.AMADEUS_BASE_URL.includes("test.api")) {
    out.push("Amadeus is pointed at the TEST environment: prices are sandbox data, not real fares.");
  }
  return out;
}
