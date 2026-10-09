// Generates the PWA icons (a check mark in a ring) as PNGs with no dependencies.
// Run: node scripts/make-icons.mjs
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 4x supersampling for smooth edges
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const p = pixel((x + (sx + 0.5) / 4) / size, (y + (sy + 0.5) / 4) / size);
          for (let i = 0; i < 4; i++) acc[i] += p[i];
        }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 4; i++) raw[o + i] = Math.round(acc[i] / 16);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

// Mark in unit coords centered at 0.5, scaled by `s`.
function isMark(u, v, s) {
  const x = (u - 0.5) / s + 0.5, y = (v - 0.5) / s + 0.5;
  const r = Math.hypot(x - 0.5, y - 0.5);
  const ring = Math.abs(r - 0.36) < 0.035;
  const check =
    Math.min(segDist(x, y, 0.33, 0.52, 0.45, 0.64), segDist(x, y, 0.45, 0.64, 0.68, 0.38)) < 0.045;
  return ring || check;
}

const ACCENT = [47, 111, 94, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

const roundedSquare = (u, v) => {
  const r = 0.2, cx = Math.min(Math.max(u, r), 1 - r), cy = Math.min(Math.max(v, r), 1 - r);
  return Math.hypot(u - cx, v - cy) <= r;
};

const out = "public/icons";
for (const size of [192, 512]) {
  writeFileSync(`${out}/icon-${size}.png`, png(size, (u, v) =>
    !roundedSquare(u, v) ? CLEAR : isMark(u, v, 1) ? WHITE : ACCENT));
}
writeFileSync(`${out}/icon-maskable-512.png`, png(512, (u, v) => (isMark(u, v, 0.75) ? WHITE : ACCENT)));
writeFileSync(`${out}/apple-touch-icon.png`, png(180, (u, v) => (isMark(u, v, 0.85) ? WHITE : ACCENT)));
writeFileSync(`${out}/badge-96.png`, png(96, (u, v) => (isMark(u, v, 1.15) ? WHITE : CLEAR)));
console.log("icons written to", out);
