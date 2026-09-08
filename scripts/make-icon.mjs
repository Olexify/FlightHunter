import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Generates assets/flighthunter.ico — the icon for the Windows shortcut.
 *
 * Drawn here rather than shipped as a binary blob so it stays editable and
 * reviewable, and built with only node:zlib so it adds no dependency. Shapes
 * are rendered at 4x and downsampled, which is enough anti-aliasing for an
 * icon without pulling in a rasteriser.
 */

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
function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Each scanline is prefixed with filter type 0 (none).
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* --------------------------------- drawing -------------------------------- */

/** Signed distance helper: is (x,y) inside a rounded square? */
function insideRoundedSquare(x, y, size, radius) {
  const min = radius;
  const max = size - radius;
  const cx = Math.min(Math.max(x, min), max);
  const cy = Math.min(Math.max(y, min), max);
  if (x >= min && x <= max) return y >= 0 && y <= size;
  if (y >= min && y <= max) return x >= 0 && x <= size;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius;
}

/** Even-odd point-in-polygon. Points are normalised 0..1. */
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

// A paper plane: nose top-right, tail left, body notch, lower fin.
const PLANE = [
  [0.93, 0.13],
  [0.07, 0.47],
  [0.38, 0.585],
  [0.45, 0.92],
];
/** The fold line, cut out so the shape reads as folded paper. */
const FOLD = [
  [0.93, 0.13],
  [0.38, 0.585],
  [0.45, 0.92],
];

const BG = [37, 99, 235]; // --accent
const FG = [255, 255, 255];

function render(size) {
  const SS = 4; // supersample factor
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

          if (!insideRoundedSquare(px, py, big, big * 0.22)) continue;
          bgHits++;

          const nx = px / big;
          const ny = py / big;
          // Inset the plane so it does not touch the tile edges.
          const ix = (nx - 0.12) / 0.76;
          const iy = (ny - 0.12) / 0.76;

          if (insidePolygon(ix, iy, PLANE) && !insidePolygon(ix, iy, FOLD)) fgHits++;
        }
      }

      const total = SS * SS;
      const alpha = bgHits / total;
      const fg = fgHits / total;
      const i = (y * size + x) * 4;

      if (alpha === 0) {
        out[i + 3] = 0;
        continue;
      }
      // Blend the plane over the tile, then apply the tile's own coverage.
      const mix = fg / alpha;
      out[i] = Math.round(BG[0] * (1 - mix) + FG[0] * mix);
      out[i + 1] = Math.round(BG[1] * (1 - mix) + FG[1] * mix);
      out[i + 2] = Math.round(BG[2] * (1 - mix) + FG[2] * mix);
      out[i + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

/* ---------------------------------- ICO ----------------------------------- */

const SIZES = [16, 24, 32, 48, 64, 128, 256];

const images = SIZES.map((size) => ({ size, png: encodePng(render(size), size) }));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // 1 = icon
header.writeUInt16LE(images.length, 4);

let offset = 6 + images.length * 16;
const entries = [];
for (const { size, png } of images) {
  const e = Buffer.alloc(16);
  e[0] = size === 256 ? 0 : size; // 0 means 256
  e[1] = size === 256 ? 0 : size;
  e[2] = 0; // palette
  e[3] = 0; // reserved
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += png.length;
}

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "assets", "flighthunter.ico");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, Buffer.concat([header, ...entries, ...images.map((i) => i.png)]));

console.log(`wrote ${target} (${SIZES.join(", ")} px, ${offset} bytes)`);
