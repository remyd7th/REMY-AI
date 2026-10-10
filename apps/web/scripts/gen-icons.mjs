// Generates Remy AI PWA icons with zero dependencies (Node built-ins only).
// Flat dark rounded square + four-point spark mark. Writes PNGs via manual
// chunks (signature / IHDR / IDAT with zlib / IEND) + CRC32.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(root, { recursive: true });

const BG = [17, 24, 39, 255]; // --remy-heading #111827
const MARK = [249, 250, 251, 255]; // near-white
const ACCENT = [165, 180, 252, 255]; // --remy-accent (dark) #a5b4fc

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function toPng(size, pixels) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0; // filter: none
    Buffer.from(pixels.subarray(y * size * 4, (y + 1) * size * 4)).copy(raw, y * (1 + size * 4) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Four-point spark: |x|^p + |y|^p <= R^p with p < 1 gives concave sparkle arms.
function paint(size, { rounded, markScale }) {
  const px = new Uint8ClampedArray(size * size * 4);
  const r = rounded ? size * 0.225 : 0;
  const R = size * 0.27 * markScale;
  const dotR = size * 0.045 * markScale;
  const dotCx = size * 0.5 + R * 0.95;
  const dotCy = size * 0.5 - R * 1.05;
  const p = 0.7;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Background: rounded rect (or full bleed for maskable).
      let inBg = true;
      if (rounded) {
        const cx = Math.min(Math.max(x, r), size - r);
        const cy = Math.min(Math.max(y, r), size - r);
        inBg = (x - cx) ** 2 + (y - cy) ** 2 <= r * r || (x >= r && x < size - r) || (y >= r && y < size - r);
        const edge = (x - cx) ** 2 + (y - cy) ** 2;
        if (!inBg || (edge > (r - 1) * (r - 1) && edge <= r * r && (x < r || x >= size - r) && (y < r || y >= size - r))) {
          if (!inBg) {
            px[i + 3] = 0;
            continue;
          }
        }
      }
      px[i] = BG[0]; px[i + 1] = BG[1]; px[i + 2] = BG[2]; px[i + 3] = 255;
      const dx = Math.abs(x - size / 2) / (R || 1);
      const dy = Math.abs(y - size / 2) / (R || 1);
      const spark = dx ** p + dy ** p <= 1;
      const dot = (x - dotCx) ** 2 + (y - dotCy) ** 2 <= dotR * dotR;
      if (spark) {
        px[i] = MARK[0]; px[i + 1] = MARK[1]; px[i + 2] = MARK[2];
      } else if (dot) {
        px[i] = ACCENT[0]; px[i + 1] = ACCENT[1]; px[i + 2] = ACCENT[2];
      }
    }
  }
  return px;
}

const targets = [
  { file: 'icon-192.png', size: 192, rounded: true, markScale: 1 },
  { file: 'icon-512.png', size: 512, rounded: true, markScale: 1 },
  { file: 'maskable-512.png', size: 512, rounded: false, markScale: 0.72 },
  { file: 'apple-touch-180.png', size: 180, rounded: false, markScale: 0.9 },
];

for (const t of targets) {
  writeFileSync(join(root, t.file), toPng(t.size, paint(t.size, t)));
  console.log(`wrote icons/${t.file}`);
}
