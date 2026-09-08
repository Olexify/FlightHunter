import { describe, expect, it } from "vitest";
import { parseEnv } from "./config.js";

/**
 * The setup instructions tell you to copy .env.example to .env, which ships
 * every key blank. dotenv loads `KEY=` as an empty string, and a schema that
 * treats that as "present" rejects it — so following the documented setup
 * stopped the server booting at all. These tests pin that shut.
 */
describe("blank environment variables count as unset", () => {
  it("accepts a freshly copied .env.example with every key blank", () => {
    const raw = {
      AMADEUS_CLIENT_ID: "",
      AMADEUS_CLIENT_SECRET: "",
      TRAVELPAYOUTS_TOKEN: "",
      TRAVELPAYOUTS_MARKER: "",
    } as NodeJS.ProcessEnv;

    expect(() => parseEnv(raw)).not.toThrow();
  });

  it("reports blank credentials as absent rather than configured", () => {
    const cfg = parseEnv({ AMADEUS_CLIENT_ID: "", AMADEUS_CLIENT_SECRET: "" } as NodeJS.ProcessEnv);
    expect(cfg.hasAmadeus).toBe(false);
    expect(cfg.AMADEUS_CLIENT_ID).toBeUndefined();
  });

  it("treats a whitespace-only value as blank too", () => {
    const cfg = parseEnv({ TRAVELPAYOUTS_TOKEN: "   " } as NodeJS.ProcessEnv);
    expect(cfg.hasTravelpayouts).toBe(false);
  });

  it("falls back to the default when a defaulted key is blank", () => {
    // An empty CORS_ORIGINS should mean "use the default", not "allow nothing".
    const cfg = parseEnv({ CORS_ORIGINS: "" } as NodeJS.ProcessEnv);
    expect(cfg.corsOrigins).toEqual(["http://localhost:5173"]);
  });

  it("still reads real values", () => {
    const cfg = parseEnv({
      AMADEUS_CLIENT_ID: "abc",
      AMADEUS_CLIENT_SECRET: "def",
      PORT: "4100",
    } as NodeJS.ProcessEnv);

    expect(cfg.hasAmadeus).toBe(true);
    expect(cfg.PORT).toBe(4100);
  });
});

describe("half-configured Amadeus is treated as unconfigured", () => {
  it("does not enable Amadeus with only a client id", () => {
    const cfg = parseEnv({ AMADEUS_CLIENT_ID: "abc" } as NodeJS.ProcessEnv);
    expect(cfg.hasAmadeus).toBe(false);
  });
});

describe("trust proxy defaults to off", () => {
  it("is off when unset, because req.ip would otherwise be caller-controlled", () => {
    expect(parseEnv({} as NodeJS.ProcessEnv).TRUST_PROXY).toBe(false);
  });

  it("accepts true and 1, and rejects anything else as off", () => {
    expect(parseEnv({ TRUST_PROXY: "true" } as NodeJS.ProcessEnv).TRUST_PROXY).toBe(true);
    expect(parseEnv({ TRUST_PROXY: "1" } as NodeJS.ProcessEnv).TRUST_PROXY).toBe(true);
    expect(parseEnv({ TRUST_PROXY: "false" } as NodeJS.ProcessEnv).TRUST_PROXY).toBe(false);
    expect(parseEnv({ TRUST_PROXY: "yes" } as NodeJS.ProcessEnv).TRUST_PROXY).toBe(false);
  });
});
