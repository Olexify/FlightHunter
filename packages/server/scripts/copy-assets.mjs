import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * tsc emits JavaScript only. The airport dataset is a runtime asset loaded by
 * `require("./airports.json")`, so without this step `npm start` would fail on
 * a built tree even though the build itself succeeded.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const assets = [["src/data/airports.json", "dist/data/airports.json"]];

for (const [from, to] of assets) {
  const source = join(root, from);
  const target = join(root, to);

  if (!existsSync(source)) {
    console.error(`copy-assets: missing ${from}`);
    process.exit(1);
  }
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target);
  console.log(`copy-assets: ${from} -> ${to}`);
}
