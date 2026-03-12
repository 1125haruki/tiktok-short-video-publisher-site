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

function roundedRectLocalSdf(x, y, w, h, r) {
  const dx = Math.abs(x) - w / 2 + r;
  const dy = Math.abs(y) - h / 2 + r;
  const qx = Math.max(dx, 0);
  const qy = Math.max(dy, 0);
  return Math.hypot(qx, qy) + Math.min(Math.max(dx, dy), 0) - r;
}

function roundedRectRotatedSdf(x, y, cx, cy, w, h, r, angle) {
  const dx = x - cx;
  const dy = y - cy;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rx = dx * c + dy * s;
  const ry = -dx * s + dy * c;
  return roundedRectLocalSdf(rx, ry, w, h, r);
}

function circleSdf(x, y, cx, cy, r) {
  return Math.hypot(x - cx, y - cy) - r;
}

function capsuleSdf(x, y, ax, ay, bx, by, r) {
  const pax = x - ax;
  const pay = y - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  return Math.hypot(dx, dy) - r;
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
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

fs.mkdirSync(outDir, { recursive: true });

const pixels = Buffer.alloc(size * size * 4);
const topBg = [20, 64, 60, 255];
const bottomBg = [234, 224, 206, 255];
const glowCoral = [220, 122, 80, 255];
const glowMint = [100, 196, 170, 255];
const dark = [17, 54, 51, 255];
const deep = [9, 34, 32, 255];
const mint = [22, 141, 116, 255];
const ivory = [252, 248, 242, 255];
const coral = [218, 119, 76, 255];
const coralSoft = [232, 181, 150, 255];
const sand = [236, 213, 170, 255];
const white = [255, 255, 255, 255];

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const idx = (y * size + x) * 4;
    const tx = x / (size - 1);
    const ty = y / (size - 1);
    let color = mix(topBg, bottomBg, tx * 0.62 + ty * 0.38);

    const g1 = clamp(1 - circleSdf(x, y, 180, 160, 310) / 360, 0, 1) * 0.22;
    const g2 = clamp(1 - circleSdf(x, y, 860, 790, 260) / 340, 0, 1) * 0.17;
    const g3 = clamp(1 - circleSdf(x, y, 680, 240, 200) / 280, 0, 1) * 0.12;
    color = over(color, [glowMint[0], glowMint[1], glowMint[2], Math.round(255 * g1)]);
    color = over(color, [glowCoral[0], glowCoral[1], glowCoral[2], Math.round(255 * g2)]);
    color = over(color, [255, 255, 255, Math.round(255 * g3)]);

    const halo = circleSdf(x, y, 536, 504, 286);
    color = over(color, softFill(halo, 90, [255, 255, 255, 56]));

    const backShadow = roundedRectRotatedSdf(x, y, 420, 512, 320, 494, 82, -0.2);
    color = over(color, softFill(backShadow - 22, 42, [8, 32, 31, 52]));

    const frontShadow = roundedRectRotatedSdf(x, y, 596, 548, 346, 522, 90, 0.12);
    color = over(color, softFill(frontShadow - 20, 46, [9, 28, 28, 56]));

    const backCard = roundedRectRotatedSdf(x, y, 420, 500, 320, 494, 82, -0.2);
    color = over(color, softFill(backCard, 2.6, dark));

    const backInner = roundedRectRotatedSdf(x, y, 420, 500, 278, 452, 62, -0.2);
    color = over(color, softFill(backInner, 2.6, [29, 91, 85, 255]));

    const backTopBar = roundedRectRotatedSdf(x, y, 420, 318, 102, 18, 9, -0.2);
    color = over(color, softFill(backTopBar, 2.0, [208, 245, 232, 255]));

    const backPlayCircle = circleSdf(x, y, 420, 530, 72);
    color = over(color, softFill(backPlayCircle, 2.4, [240, 249, 246, 220]));
    const backPlay = triangleSdf(x, y, 396, 490, 396, 570, 468, 530);
    color = over(color, softFill(backPlay, 2.2, deep));

    const frontCardOuter = roundedRectRotatedSdf(x, y, 596, 536, 346, 522, 90, 0.12);
    color = over(color, softFill(frontCardOuter, 2.6, deep));

    const frontCard = roundedRectRotatedSdf(x, y, 596, 536, 306, 482, 72, 0.12);
    color = over(color, softFill(frontCard, 2.4, ivory));

    const frontTopBar = roundedRectRotatedSdf(x, y, 596, 336, 110, 20, 10, 0.12);
    color = over(color, softFill(frontTopBar, 2.0, mint));

    const frontCircleShadow = circleSdf(x, y, 596, 548, 104);
    color = over(color, softFill(frontCircleShadow - 10, 34, [204, 116, 78, 56]));

    const frontCircle = circleSdf(x, y, 596, 536, 104);
    color = over(color, softFill(frontCircle, 2.4, coral));

    const frontPlay = triangleSdf(x, y, 562, 486, 562, 586, 650, 536);
    color = over(color, softFill(frontPlay, 2.2, white));

    const arrowShadow = capsuleSdf(x, y, 314, 716, 770, 350, 24);
    color = over(color, softFill(arrowShadow - 12, 28, [14, 43, 40, 68]));

    const arrowStroke = capsuleSdf(x, y, 312, 710, 760, 352, 24);
    color = over(color, softFill(arrowStroke, 2.2, [247, 235, 219, 255]));

    const arrowBody = capsuleSdf(x, y, 326, 698, 742, 364, 18);
    color = over(color, softFill(arrowBody, 2.2, sand));

    const arrowHead = triangleSdf(x, y, 704, 300, 824, 324, 748, 428);
    color = over(color, softFill(arrowHead, 2.4, sand));

    const dot1 = circleSdf(x, y, 792, 248, 20);
    color = over(color, softFill(dot1, 2.0, coralSoft));
    const dot2 = circleSdf(x, y, 220, 770, 16);
    color = over(color, softFill(dot2, 2.0, white));
    const dot3 = circleSdf(x, y, 764, 742, 14);
    color = over(color, softFill(dot3, 2.0, mint));
    const dot4 = circleSdf(x, y, 302, 266, 12);
    color = over(color, softFill(dot4, 2.0, [255, 255, 255, 150]));

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
