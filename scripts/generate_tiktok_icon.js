const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const size = 1024;
const outDir = path.join(__dirname, "..", "assets");
const outPath = path.join(outDir, "tiktok-app-icon.png");

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mix(c1, c2, t) {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
    Math.round(lerp(c1[3], c2[3], t)),
  ];
}

function over(dst, src) {
  const sa = src[3] / 255;
  const da = dst[3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return [0, 0, 0, 0];
  return [
    Math.round((src[0] * sa + dst[0] * da * (1 - sa)) / oa),
    Math.round((src[1] * sa + dst[1] * da * (1 - sa)) / oa),
    Math.round((src[2] * sa + dst[2] * da * (1 - sa)) / oa),
    Math.round(oa * 255),
  ];
}

function roundedRectSdf(x, y, cx, cy, w, h, r) {
  const dx = Math.abs(x - cx) - w / 2 + r;
  const dy = Math.abs(y - cy) - h / 2 + r;
  const qx = Math.max(dx, 0);
  const qy = Math.max(dy, 0);
  return Math.hypot(qx, qy) + Math.min(Math.max(dx, dy), 0) - r;
}

function circleSdf(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) - r;
}

function triangleSdf(px, py, ax, ay, bx, by, cx, cy) {
  const e0x = bx - ax;
  const e0y = by - ay;
  const e1x = cx - bx;
  const e1y = cy - by;
  const e2x = ax - cx;
  const e2y = ay - cy;
  const v0x = px - ax;
  const v0y = py - ay;
  const v1x = px - bx;
  const v1y = py - by;
  const v2x = px - cx;
  const v2y = py - cy;
  const pq0x = v0x - e0x * clamp((v0x * e0x + v0y * e0y) / (e0x * e0x + e0y * e0y), 0, 1);
  const pq0y = v0y - e0y * clamp((v0x * e0x + v0y * e0y) / (e0x * e0x + e0y * e0y), 0, 1);
  const pq1x = v1x - e1x * clamp((v1x * e1x + v1y * e1y) / (e1x * e1x + e1y * e1y), 0, 1);
  const pq1y = v1y - e1y * clamp((v1x * e1x + v1y * e1y) / (e1x * e1x + e1y * e1y), 0, 1);
  const pq2x = v2x - e2x * clamp((v2x * e2x + v2y * e2y) / (e2x * e2x + e2y * e2y), 0, 1);
  const pq2y = v2y - e2y * clamp((v2x * e2x + v2y * e2y) / (e2x * e2x + e2y * e2y), 0, 1);
  const s = Math.sign(e0x * e2y - e0y * e2x);
  const d0 = Math.min(
    pq0x * pq0x + pq0y * pq0y,
    Math.min(pq1x * pq1x + pq1y * pq1y, pq2x * pq2x + pq2y * pq2y)
  );
  const s0 = s * (v0x * e0y - v0y * e0x);
  const s1 = s * (v1x * e1y - v1y * e1x);
  const s2 = s * (v2x * e2y - v2y * e2x);
  const inside = Math.min(s0, Math.min(s1, s2)) <= 0 ? 1 : -1;
  return Math.sqrt(d0) * inside;
}

function softFill(sdf, edge, color) {
  const alpha = clamp(0.5 - sdf / edge, 0, 1);
  return [color[0], color[1], color[2], Math.round(color[3] * alpha)];
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

fs.mkdirSync(outDir, { recursive: true });

const pixels = Buffer.alloc(size * size * 4);
const bgTop = [242, 238, 231, 255];
const bgBottom = [227, 220, 208, 255];
const shadow = [25, 43, 40, 255];
const frame = [18, 55, 51, 255];
const screen = [251, 247, 241, 255];
const mint = [20, 136, 112, 255];
const coral = [218, 125, 82, 255];
const white = [255, 255, 255, 255];

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const idx = (y * size + x) * 4;
    const t = y / (size - 1);
    let color = mix(bgTop, bgBottom, t);

    const glow = circleSdf(x, y, 512, 472, 260);
    color = over(color, softFill(glow, 120, [255, 255, 255, 42]));

    const cardShadow = roundedRectSdf(x, y, 512, 540, 430, 620, 104);
    color = over(color, softFill(cardShadow - 18, 42, [shadow[0], shadow[1], shadow[2], 52]));

    const cardOuter = roundedRectSdf(x, y, 512, 512, 430, 620, 104);
    color = over(color, softFill(cardOuter, 2.4, frame));

    const cardInner = roundedRectSdf(x, y, 512, 512, 368, 558, 78);
    color = over(color, softFill(cardInner, 2.4, screen));

    const topPill = roundedRectSdf(x, y, 512, 274, 116, 22, 11);
    color = over(color, softFill(topPill, 2.0, mint));

    const playCircleShadow = circleSdf(x, y, 512, 560, 118);
    color = over(color, softFill(playCircleShadow - 8, 30, [189, 104, 66, 44]));

    const playCircle = circleSdf(x, y, 512, 548, 118);
    color = over(color, softFill(playCircle, 2.2, coral));

    const playTriangle = triangleSdf(x, y, 470, 490, 470, 606, 578, 548);
    color = over(color, softFill(playTriangle, 2.0, white));

    pixels[idx] = color[0];
    pixels[idx + 1] = color[1];
    pixels[idx + 2] = color[2];
    pixels[idx + 3] = color[3];
  }
}

const rowBytes = size * 4 + 1;
const raw = Buffer.alloc(rowBytes * size);
for (let y = 0; y < size; y += 1) {
  const rowStart = y * rowBytes;
  raw[rowStart] = 0;
  pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk("IHDR", ihdr),
  pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  pngChunk("IEND", Buffer.alloc(0)),
]);

fs.writeFileSync(outPath, png);
console.log(outPath);
