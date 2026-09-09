import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Generates every Flight Hunter brand asset from one definition of the mark.
 *
 * The geometry below is the single source of truth: the SVG, the .ico, the
 * favicons and the PWA icons are all derived from it, so they can never drift
 * apart. Built with only node:zlib for PNG encoding, so it adds no dependency.
 *
 *   node scripts/make-icon.mjs
 */

/* -------------------------------- geometry -------------------------------- */

/** Brand blue — the same --accent the UI uses. */
const BG = [37, 99, 235];
const FG = [255, 255, 255];

/** Corner radius as a fraction of the tile. */
const RADIUS = 0.22;
/** The mark is inset so it never touches the tile edge. */
const INSET = 0.12;
const SCALE = 1 - INSET * 2;

/** A paper plane: nose top-right, tail left, body notch, lower fin. */
const PLANE = [
  [0.93, 0.13],
  [0.07, 0.47],
  [0.38, 0.585],
  [0.45, 0.92],
];
/** The fold, cut out so the shape reads as folded paper rather than a blob. */
const FOLD = [
  [0.93, 0.13],
  [0.38, 0.585],
  [0.45, 0.92],
];

/* ------------------------------- PNG writer ------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA pixel buffer -> PNG. */
function encodePng(rgba, width, height = width) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  // Each scanline carries a leading filter byte; 0 means "none".
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* --------------------------------- drawing -------------------------------- */

function insideRoundedSquare(x, y, size, radius) {
  const min = radius;
  const max = size - radius;
  const cx = Math.min(Math.max(x, min), max);
  const cy = Math.min(Math.max(y, min), max);
  if (x >= min && x <= max) return y >= 0 && y <= size;
  if (y >= min && y <= max) return x >= 0 && x <= size;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius;
}

/** Even-odd point-in-polygon over normalised 0..1 coordinates. */
function insidePolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Renders the tile at `size`, supersampled 4x. That is enough anti-aliasing
 * for an icon without pulling in a rasteriser.
 *
 * `tile` false draws only the mark on transparency, for the wordmark lockup.
 */
function render(size, { tile = true } = {}) {
  const SS = 4;
  const big = size * SS;
  const out = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgHits = 0;
      let fgHits = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x * SS + sx + 0.5;
          const py = y * SS + sy + 0.5;

          if (tile && !insideRoundedSquare(px, py, big, big * RADIUS)) continue;
          bgHits++;

          const ix = (px / big - INSET) / SCALE;
          const iy = (py / big - INSET) / SCALE;
          if (insidePolygon(ix, iy, PLANE) && !insidePolygon(ix, iy, FOLD)) fgHits++;
        }
      }

      const total = SS * SS;
      const i = (y * size + x) * 4;

      if (!tile) {
        // Mark only: the plane in brand blue on transparency.
        const a = fgHits / total;
        out[i] = BG[0];
        out[i + 1] = BG[1];
        out[i + 2] = BG[2];
        out[i + 3] = Math.round(a * 255);
        continue;
      }

      const alpha = bgHits / total;
      if (alpha === 0) {
        out[i + 3] = 0;
        continue;
      }
      const mix = fgHits / total / alpha;
      out[i] = Math.round(BG[0] * (1 - mix) + FG[0] * mix);
      out[i + 1] = Math.round(BG[1] * (1 - mix) + FG[1] * mix);
      out[i + 2] = Math.round(BG[2] * (1 - mix) + FG[2] * mix);
      out[i + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

/* ---------------------------------- SVG ----------------------------------- */

const S = 256;
const pt = ([x, y]) =>
  `${(((x * SCALE + INSET) * S)).toFixed(1)},${(((y * SCALE + INSET) * S)).toFixed(1)}`;
const pathOf = (poly) => `M${poly.map(pt).join("L")}Z`;

const rgb = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** Vector master. Everything above rasterises the same shapes. */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="Flight Hunter">
  <title>Flight Hunter</title>
  <rect width="${S}" height="${S}" rx="${(S * RADIUS).toFixed(0)}" fill="${rgb(BG)}"/>
  <path d="${pathOf(PLANE)} ${pathOf(FOLD)}" fill="${rgb(FG)}" fill-rule="evenodd"/>
</svg>
`;

/* ---------------------------------- ICO ----------------------------------- */

function buildIco(sizes) {
  const images = sizes.map((size) => ({ size, png: encodePng(render(size), size) }));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e[0] = size === 256 ? 0 : size; // 0 encodes 256
    e[1] = size === 256 ? 0 : size;
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

/* --------------------------------- output --------------------------------- */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const assets = join(root, "assets");
// Vite serves everything in public/ from the site root.
const publicDir = join(root, "packages", "client", "public");

mkdirSync(assets, { recursive: true });
mkdirSync(publicDir, { recursive: true });

const written = [];
const write = (path, data) => {
  writeFileSync(path, data);
  written.push([path.replace(root + "\\", "").replace(root + "/", ""), data.length]);
};

const ico = buildIco([16, 24, 32, 48, 64, 128, 256]);

write(join(assets, "logo.svg"), Buffer.from(svg, "utf8"));
write(join(assets, "flighthunter.ico"), ico);
// Shown in the README, where a transparent tile would vanish on dark themes.
write(join(assets, "logo-256.png"), encodePng(render(256), 256));

write(join(publicDir, "favicon.ico"), ico);
write(join(publicDir, "favicon.svg"), Buffer.from(svg, "utf8"));
write(join(publicDir, "apple-touch-icon.png"), encodePng(render(180), 180));
write(join(publicDir, "icon-192.png"), encodePng(render(192), 192));
write(join(publicDir, "icon-512.png"), encodePng(render(512), 512));

for (const [path, bytes] of written) {
  console.log(`  ${path.padEnd(44)} ${String(bytes).padStart(7)} bytes`);
}
console.log(`\n  ${written.length} assets written from one definition of the mark.`);
