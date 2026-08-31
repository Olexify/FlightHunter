import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts"],
    // Each suite is fast; a short timeout keeps a hung test obvious.
    testTimeout: 10_000,
    reporters: "default",
  },
  resolve: {
    alias: {
      // Test against shared SOURCE, so a test run never silently uses a stale
      // dist build of the contracts package.
      "@flighthunter/shared": new URL("./packages/shared/src/index.ts", import.meta.url).pathname,
    },
  },
});
