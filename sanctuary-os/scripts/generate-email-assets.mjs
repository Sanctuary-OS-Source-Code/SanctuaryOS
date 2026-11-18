import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outPngDir = path.join(rootDir, "public", "email");
const outTsPath = path.join(rootDir, "src", "utils", "sanctuaryEmailAssetData.ts");
const outEdgeTsPath = path.join(
  rootDir,
  "supabase",
  "functions",
  "keeper-email-dispatch",
  "assetsData.ts"
);

// Precompute IEEE 802.3 CRC32 table for valid PNG chunks
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, crcInput, crcBuf]);
}

function encodeRgbaPng(width, height, rgba, useSubFilter = false) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowOff = y * (stride + 1);
    const srcOff = y * stride;
    if (!useSubFilter) {
      raw[rowOff] = 0; // filter type None
      rgba.copy(raw, rowOff + 1, srcOff, srcOff + stride);
    } else {
      raw[rowOff] = 1; // filter type Sub (high compression on smooth gradients)
      for (let i = 0; i < stride; i++) {
        const left = i >= 4 ? rgba[srcOff + i - 4] : 0;
        raw[rowOff + 1 + i] = (rgba[srcOff + i] - left) & 0xff;
      }
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngToRgba(filePath) {
  const buf = fs.readFileSync(filePath);
  let pos = 8; // skip 8-byte PNG signature
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const dataStart = pos + 8;
    const dataEnd = dataStart + len;
    if (type === "IHDR") {
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
      bitDepth = buf[dataStart + 8];
      colorType = buf[dataStart + 9];
    } else if (type === "IDAT") {
      idatChunks.push(buf.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }
    pos = dataEnd + 4;
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format (bitDepth=${bitDepth}, colorType=${colorType}) in ${filePath}`);
  }

  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const rgba = Buffer.alloc(width * height * 4);
  const prevRow = new Uint8Array(stride);
  const curRow = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    for (let i = 0; i < stride; i++) {
      const xByte = raw[rowStart + 1 + i];
      const a = i >= bpp ? curRow[i - bpp] : 0;
      const b = prevRow[i];
      const c = i >= bpp ? prevRow[i - bpp] : 0;
      let val = xByte;
      if (filter === 1) val = (xByte + a) & 0xff;
      else if (filter === 2) val = (xByte + b) & 0xff;
      else if (filter === 3) val = (xByte + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) val = (xByte + paethPredictor(a, b, c)) & 0xff;
      curRow[i] = val;
    }
    prevRow.set(curRow);

    const outOff = y * width * 4;
    if (bpp === 4) {
      rgba.set(curRow, outOff);
    } else {
      for (let x = 0; x < width; x++) {
        rgba[outOff + x * 4] = curRow[x * 3];
        rgba[outOff + x * 4 + 1] = curRow[x * 3 + 1];
        rgba[outOff + x * 4 + 2] = curRow[x * 3 + 2];
        rgba[outOff + x * 4 + 3] = 255;
      }
    }
  }

  return { width, height, rgba };
}

function boxBlurHorizontal(src, dst, width, height, radius) {
  const winSize = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    const rowOff = y * width * 3;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let kx = -radius; kx <= radius; kx++) {
      const sx = Math.max(0, Math.min(width - 1, kx));
      const idx = rowOff + sx * 3;
      sumR += src[idx];
      sumG += src[idx + 1];
      sumB += src[idx + 2];
    }
    for (let x = 0; x < width; x++) {
      const outIdx = rowOff + x * 3;
      dst[outIdx] = sumR / winSize;
      dst[outIdx + 1] = sumG / winSize;
      dst[outIdx + 2] = sumB / winSize;

      const rmX = Math.max(0, x - radius);
      const addX = Math.min(width - 1, x + radius + 1);
      const rmIdx = rowOff + rmX * 3;
      const addIdx = rowOff + addX * 3;
      sumR += src[addIdx] - src[rmIdx];
      sumG += src[addIdx + 1] - src[rmIdx + 1];
      sumB += src[addIdx + 2] - src[rmIdx + 2];
    }
  }
}

function boxBlurVertical(src, dst, width, height, radius) {
  const winSize = radius * 2 + 1;
  for (let x = 0; x < width; x++) {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let ky = -radius; ky <= radius; ky++) {
      const sy = Math.max(0, Math.min(height - 1, ky));
      const idx = (sy * width + x) * 3;
      sumR += src[idx];
      sumG += src[idx + 1];
      sumB += src[idx + 2];
    }
    for (let y = 0; y < height; y++) {
      const outIdx = (y * width + x) * 3;
      dst[outIdx] = sumR / winSize;
      dst[outIdx + 1] = sumG / winSize;
      dst[outIdx + 2] = sumB / winSize;

      const rmY = Math.max(0, y - radius);
      const addY = Math.min(height - 1, y + radius + 1);
      const rmIdx = (rmY * width + x) * 3;
      const addIdx = (addY * width + x) * 3;
      sumR += src[addIdx] - src[rmIdx];
      sumG += src[addIdx + 1] - src[rmIdx + 1];
      sumB += src[addIdx + 2] - src[rmIdx + 2];
    }
  }
}

function buildArchitectCardSurfacePng() {
  const archPath = path.join(rootDir, "public", "themes", "architect.png");
  const arch = decodePngToRgba(archPath);
  const w = 680;
  const h = 480;
  let bufA = new Float32Array(w * h * 3);
  let bufB = new Float32Array(w * h * 3);

  // Bilinear sample focal region u: 0.10..0.90, v: 0.08..0.86 of architect.png
  for (let y = 0; y < h; y++) {
    const tv = y / Math.max(1, h - 1);
    const srcV = 0.08 + tv * (0.86 - 0.08);
    const fy = srcV * (arch.height - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(arch.height - 1, y0 + 1);
    const wy = fy - y0;

    for (let x = 0; x < w; x++) {
      const tu = x / Math.max(1, w - 1);
      const srcU = 0.10 + tu * (0.90 - 0.10);
      const fx = srcU * (arch.width - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(arch.width - 1, x0 + 1);
      const wx = fx - x0;

      const i00 = (y0 * arch.width + x0) * 4;
      const i10 = (y0 * arch.width + x1) * 4;
      const i01 = (y1 * arch.width + x0) * 4;
      const i11 = (y1 * arch.width + x1) * 4;

      const outIdx = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) {
        const top = arch.rgba[i00 + c] * (1 - wx) + arch.rgba[i10 + c] * wx;
        const bot = arch.rgba[i01 + c] * (1 - wx) + arch.rgba[i11 + c] * wx;
        bufA[outIdx + c] = top * (1 - wy) + bot * wy;
      }
    }
  }

  // 4-pass separable sliding-window blur (radius=38 eliminates harsh contrast hotspots)
  for (let pass = 0; pass < 4; pass++) {
    boxBlurHorizontal(bufA, bufB, w, h, 38);
    boxBlurVertical(bufB, bufA, w, h, 38);
  }

  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const idx = (y * w + x) * 3;
      let r = bufA[idx];
      let g = bufA[idx + 1];
      let b = bufA[idx + 2];

      // Soft highlight compression so blurred cyan accents stay calm behind readable prose
      r = r > 145 ? 145 + (r - 145) * 0.35 : r;
      g = g > 145 ? 145 + (g - 145) * 0.35 : g;
      b = b > 145 ? 145 + (b - 145) * 0.35 : b;

      // Subtle Liquid Glass 1.22x saturation boost
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = Math.max(0, Math.min(255, luma + (r - luma) * 1.22));
      g = Math.max(0, Math.min(255, luma + (g - luma) * 1.22));
      b = Math.max(0, Math.min(255, luma + (b - luma) * 1.22));

      // Smoked Architect crystal tint (#070f20 @ alpha 0.68) matching native Sanctuary OS glass cards
      let col = [r, g, b, 1.0];
      col = over(col, 7, 15, 32, 0.68);

      // Gentle top-left sapphire ambient lift for luminous glass depth
      const cobaltAmbient = radialFalloff(u - 0.18, v - 0.16, 0.95, 0.90) * 0.14;
      col = over(col, 24, 68, 138, cobaltAmbient);

      // Soft 135-deg Liquid Glass sheen
      const sheenFactor = Math.max(0, 1 - (u * 0.65 + v * 0.75) * 1.35);
      if (sheenFactor > 0.001) {
        col = over(col, 255, 255, 255, sheenFactor * 0.055);
      }

      // Soft top rim meniscus highlight
      const meniscus = radialFalloff(u - 0.5, v + 0.14, 0.90, 0.48) * 0.065;
      if (meniscus > 0.001) {
        col = over(col, 214, 241, 255, meniscus);
      }

      const outOff = (y * w + x) * 4;
      rgba[outOff] = clampByte(col[0]);
      rgba[outOff + 1] = clampByte(col[1]);
      rgba[outOff + 2] = clampByte(col[2]);
      rgba[outOff + 3] = 255;
    }
  }

  return encodeRgbaPng(w, h, rgba, true);
}

/** Downsamples 192x192 transparent winged-S Sanctuary crest to 96x96 with premultiplied alpha filtering. */
function buildSanctuaryLogoPng() {
  const logoPath = path.join(rootDir, "public", "pwa-192x192.png");
  const src = decodePngToRgba(logoPath);
  const outW = Math.floor(src.width / 2);
  const outH = Math.floor(src.height / 2);
  const outRgba = Buffer.alloc(outW * outH * 4);

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(src.width - 1, x * 2 + dx);
          const sy = Math.min(src.height - 1, y * 2 + dy);
          const si = (sy * src.width + sx) * 4;
          const a = src.rgba[si + 3];
          sumR += src.rgba[si] * a;
          sumG += src.rgba[si + 1] * a;
          sumB += src.rgba[si + 2] * a;
          sumA += a;
        }
      }
      const oi = (y * outW + x) * 4;
      if (sumA > 0) {
        outRgba[oi] = clampByte(sumR / sumA);
        outRgba[oi + 1] = clampByte(sumG / sumA);
        outRgba[oi + 2] = clampByte(sumB / sumA);
        outRgba[oi + 3] = clampByte(sumA / 4);
      } else {
        outRgba[oi] = 0;
        outRgba[oi + 1] = 0;
        outRgba[oi + 2] = 0;
        outRgba[oi + 3] = 0;
      }
    }
  }

  return encodeRgbaPng(outW, outH, outRgba, true);
}

function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function over(bg, fgR, fgG, fgB, fgA) {
  const [br, bgC, bb, ba] = bg;
  const outA = fgA + ba * (1 - fgA);
  if (outA <= 1e-6) return [0, 0, 0, 0];
  return [
    (fgR * fgA + br * ba * (1 - fgA)) / outA,
    (fgG * fgA + bgC * ba * (1 - fgA)) / outA,
    (fgB * fgA + bb * ba * (1 - fgA)) / outA,
    outA,
  ];
}

function renderTexture(width, height, sampler) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const [r, g, b, a] = sampler(u, v, x, y, width, height);
      const off = (y * width + x) * 4;
      rgba[off] = clampByte(r);
      rgba[off + 1] = clampByte(g);
      rgba[off + 2] = clampByte(b);
      rgba[off + 3] = clampByte(a * 255);
    }
  }
  return encodeRgbaPng(width, height, rgba);
}

// Geometric SDF primitives in normalized [0, 1] x [0, 1] space (px space normalized by size)
function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const denom = bax * bax + bay * bay || 1e-9;
  const h = clamp01((pax * bax + pay * bay) / denom);
  return Math.hypot(pax - bax * h, pay - bay * h);
}

function sdRoundedBox(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - halfW + r;
  const qy = Math.abs(py - cy) - halfH + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function renderSdfGlyph(size, colorRgb, sdfDistFn) {
  const rgba = Buffer.alloc(size * size * 4);
  const aaWidth = 1.1 / size;
  const [cr, cg, cb] = colorRgb;
  const sub = 4;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let coverage = 0;
      for (let sy = 0; sy < sub; sy++) {
        for (let sx = 0; sx < sub; sx++) {
          const u = (x + (sx + 0.5) / sub) / size;
          const v = (y + (sy + 0.5) / sub) / size;
          const d = sdfDistFn(u, v);
          coverage += clamp01(0.5 - d / aaWidth);
        }
      }
      const alpha = coverage / (sub * sub);
      const off = (y * size + x) * 4;
      rgba[off] = cr;
      rgba[off + 1] = cg;
      rgba[off + 2] = cb;
      rgba[off + 3] = clampByte(alpha * 255);
    }
  }
  return encodeRgbaPng(size, size, rgba);
}

function radialFalloff(dx, dy, rx, ry) {
  const d = Math.hypot(dx / rx, dy / ry);
  return d >= 1 ? 0 : Math.pow(1 - d, 1.65);
}

// 1. Glass surface PNGs (no solid background-color needed on cards!)
const glassAlertCardPng = renderTexture(320, 240, (u, v, _x, y) => {
  let col = [6, 15, 32, 0.80];
  const tlGlow = radialFalloff(u - 0.04, v - 0.02, 0.88, 0.72) * 0.16;
  col = over(col, 56, 189, 248, tlGlow);
  const trGlow = radialFalloff(u - 0.90, v - 0.12, 0.52, 0.48) * 0.11;
  col = over(col, 56, 189, 248, trGlow);
  if (y === 0) {
    col = over(col, 255, 255, 255, 0.18);
  } else if (y === 1) {
    col = over(col, 186, 230, 253, 0.08);
  }
  return col;
});

const glassPillPng = renderTexture(240, 72, (u, v, _x, y) => {
  let col = [7, 17, 36, 0.82];
  const sheen = radialFalloff(u - 0.14, v - 0.0, 0.78, 0.95) * 0.10;
  col = over(col, 125, 211, 252, sheen);
  if (y === 0) {
    col = over(col, 255, 255, 255, 0.15);
  }
  return col;
});

const glassIconBoxPng = renderTexture(88, 88, (u, v, _x, y) => {
  let col = [16, 38, 72, 0.72];
  const bloom = radialFalloff(u - 0.5, v - 0.06, 0.75, 0.75) * 0.24;
  col = over(col, 56, 189, 248, bloom);
  if (y === 0) {
    col = over(col, 255, 255, 255, 0.22);
  }
  return col;
});

const glassChipPng = renderTexture(160, 48, (u, v, _x, y) => {
  let col = [10, 24, 48, 0.84];
  const sheen = radialFalloff(u - 0.5, v - 0.0, 0.85, 0.9) * 0.08;
  col = over(col, 186, 230, 253, sheen);
  if (y === 0) {
    col = over(col, 255, 255, 255, 0.14);
  }
  return col;
});

const glassBtnPng = renderTexture(320, 64, (u, v, _x, y) => {
  let col = [8, 21, 44, 0.84];
  const sheen = radialFalloff(u - 0.5, v - 0.0, 0.9, 0.85) * 0.14;
  col = over(col, 125, 211, 252, sheen);
  if (y === 0) {
    col = over(col, 224, 242, 254, 0.18);
  }
  return col;
});

// 2. Crisp 44x44 Cyan (#38bdf8) Vector-SDF Icons
const CYAN = [56, 189, 248];
const strokeW = 0.041;

const iconMailPng = renderSdfGlyph(44, CYAN, (u, v) => {
  const box = Math.abs(sdRoundedBox(u, v, 0.5, 0.5, 0.34, 0.25, 0.07)) - strokeW;
  const flapL = sdSegment(u, v, 0.20, 0.31, 0.50, 0.54) - strokeW * 0.92;
  const flapR = sdSegment(u, v, 0.80, 0.31, 0.50, 0.54) - strokeW * 0.92;
  return Math.min(box, flapL, flapR);
});

const iconLayersPng = renderSdfGlyph(44, CYAN, (u, v) => {
  const top1 = sdSegment(u, v, 0.50, 0.18, 0.82, 0.35) - strokeW * 0.9;
  const top2 = sdSegment(u, v, 0.82, 0.35, 0.50, 0.52) - strokeW * 0.9;
  const top3 = sdSegment(u, v, 0.50, 0.52, 0.18, 0.35) - strokeW * 0.9;
  const top4 = sdSegment(u, v, 0.18, 0.35, 0.50, 0.18) - strokeW * 0.9;
  const midL = sdSegment(u, v, 0.18, 0.52, 0.50, 0.69) - strokeW * 0.9;
  const midR = sdSegment(u, v, 0.82, 0.52, 0.50, 0.69) - strokeW * 0.9;
  const botL = sdSegment(u, v, 0.18, 0.69, 0.50, 0.86) - strokeW * 0.9;
  const botR = sdSegment(u, v, 0.82, 0.69, 0.50, 0.86) - strokeW * 0.9;
  return Math.min(top1, top2, top3, top4, midL, midR, botL, botR);
});

const iconShieldPng = renderSdfGlyph(44, CYAN, (u, v) => {
  const s1 = sdSegment(u, v, 0.50, 0.16, 0.79, 0.27) - strokeW * 0.92;
  const s2 = sdSegment(u, v, 0.79, 0.27, 0.79, 0.52) - strokeW * 0.92;
  const s3 = sdSegment(u, v, 0.79, 0.52, 0.50, 0.85) - strokeW * 0.92;
  const s4 = sdSegment(u, v, 0.50, 0.85, 0.21, 0.52) - strokeW * 0.92;
  const s5 = sdSegment(u, v, 0.21, 0.52, 0.21, 0.27) - strokeW * 0.92;
  const s6 = sdSegment(u, v, 0.21, 0.27, 0.50, 0.16) - strokeW * 0.92;
  const c1 = sdSegment(u, v, 0.38, 0.50, 0.47, 0.59) - strokeW * 0.86;
  const c2 = sdSegment(u, v, 0.47, 0.59, 0.64, 0.41) - strokeW * 0.86;
  return Math.min(s1, s2, s3, s4, s5, s6, c1, c2);
});

const iconVerifiedPng = renderSdfGlyph(44, CYAN, (u, v) => {
  const ring = Math.abs(Math.hypot(u - 0.5, v - 0.5) - 0.33) - strokeW * 0.95;
  const c1 = sdSegment(u, v, 0.36, 0.51, 0.46, 0.61) - strokeW * 0.92;
  const c2 = sdSegment(u, v, 0.46, 0.61, 0.66, 0.40) - strokeW * 0.92;
  return Math.min(ring, c1, c2);
});

const iconOpenPng = renderSdfGlyph(44, CYAN, (u, v) => {
  // Open square (top-right corner cut open) + diagonal launch arrow
  const left = sdSegment(u, v, 0.22, 0.28, 0.22, 0.78) - strokeW * 0.92;
  const bottom = sdSegment(u, v, 0.22, 0.78, 0.72, 0.78) - strokeW * 0.92;
  const topLeft = sdSegment(u, v, 0.22, 0.28, 0.48, 0.28) - strokeW * 0.92;
  const rightBot = sdSegment(u, v, 0.72, 0.52, 0.72, 0.78) - strokeW * 0.92;
  const diag = sdSegment(u, v, 0.46, 0.54, 0.80, 0.20) - strokeW * 0.92;
  const headH = sdSegment(u, v, 0.60, 0.20, 0.80, 0.20) - strokeW * 0.92;
  const headV = sdSegment(u, v, 0.80, 0.20, 0.80, 0.40) - strokeW * 0.92;
  return Math.min(left, bottom, topLeft, rightBot, diag, headH, headV);
});

const glassIconTilePng = renderTexture(88, 88, (u, v, _x, y) => {
  let col = [20, 44, 82, 0.56];
  const sheen = Math.max(0, 1 - (u * 0.65 + v * 0.75) * 1.35) * 0.14;
  col = over(col, 255, 255, 255, sheen);
  const bloom = radialFalloff(u - 0.5, v - 0.04, 0.80, 0.65) * 0.16;
  col = over(col, 186, 230, 253, bloom);
  if (y === 0) {
    col = over(col, 255, 255, 255, 0.24);
  }
  return col;
});

const iconBadgeShieldPng = renderSdfGlyph(64, CYAN, (u, v) => {
  // Material verified_user-style crisp outline shield + checkmark at 64x64 (@4x for 13px chip)
  const sw = 0.044;
  const topL = sdSegment(u, v, 0.50, 0.15, 0.21, 0.27) - sw;
  const sideL = sdSegment(u, v, 0.21, 0.27, 0.21, 0.50) - sw;
  const curveL = sdSegment(u, v, 0.21, 0.50, 0.50, 0.85) - sw;
  const topR = sdSegment(u, v, 0.50, 0.15, 0.79, 0.27) - sw;
  const sideR = sdSegment(u, v, 0.79, 0.27, 0.79, 0.50) - sw;
  const curveR = sdSegment(u, v, 0.79, 0.50, 0.50, 0.85) - sw;
  const chk1 = sdSegment(u, v, 0.36, 0.50, 0.46, 0.61) - sw * 0.96;
  const chk2 = sdSegment(u, v, 0.46, 0.61, 0.66, 0.40) - sw * 0.96;
  return Math.min(topL, sideL, curveL, topR, sideR, curveR, chk1, chk2);
});

const emailCardSurfacePng = buildArchitectCardSurfacePng();
const sanctuaryLogoPng = buildSanctuaryLogoPng();

const ASSETS = {
  "email-card-surface.png": emailCardSurfacePng,
  "sanctuary-logo.png": sanctuaryLogoPng,
  "glass-icon-tile.png": glassIconTilePng,
  "icon-badge-shield.png": iconBadgeShieldPng,
  "email-canvas-bg.png": renderTexture(600, 520, (u, v, x, y, w, h) => {
    // Deep Architect space-navy (#050a17) with calm radial corner lighting & faint perimeter blueprint lines
    let col = [5, 10, 23, 1.0];

    const tlGlow = radialFalloff(u - 0.08, v - 0.04, 0.75, 0.55) * 0.14;
    col = over(col, 56, 189, 248, tlGlow);

    const trGlow = radialFalloff(u - 0.92, v - 0.14, 0.55, 0.45) * 0.10;
    col = over(col, 56, 189, 248, trGlow);

    const botGlow = radialFalloff(u - 0.50, v - 0.98, 0.80, 0.30) * 0.06;
    col = over(col, 56, 189, 248, botGlow);

    // Calm center fade mask: keep central reading area uncluttered, reveal faint grid near edges
    const edgeX = Math.max(0, (Math.abs(u - 0.5) - 0.24) / 0.26);
    const edgeY = Math.max(0, (Math.abs(v - 0.52) - 0.26) / 0.26);
    const cornerMask = clamp01(Math.max(edgeX * edgeX, edgeY * edgeY));

    if (cornerMask > 0.02) {
      // Crisp 48px orthographic grid lines
      const gx = Math.min(x % 48, 48 - (x % 48));
      const gy = Math.min(y % 48, 48 - (y % 48));
      const orthoLine = gx <= 0.75 || gy <= 0.75 ? 1 : 0;

      // Subtle isometric diamond accents in upper-right quadrant
      const isoA = Math.abs(((x * 0.5 + y) % 64) - 32);
      const isoB = Math.abs(((w - x) * 0.5 + y) % 64 - 32);
      const isoLine =
        u > 0.55 && v < 0.52 && (isoA < 0.75 || isoB < 0.75) ? 0.85 : 0;

      const lineAlpha = (orthoLine * 0.055 + isoLine * 0.045) * cornerMask;
      if (lineAlpha > 0.002) {
        col = over(col, 56, 189, 248, lineAlpha);
      }
    }

    return col;
  }),
  "glass-header-fill.png": renderTexture(16, 16, () => [12, 24, 48, 0.78]),
  "glass-surface-fill.png": renderTexture(16, 16, () => [8, 17, 36, 0.72]),
  "glass-chip-fill.png": renderTexture(16, 16, () => [14, 30, 58, 0.84]),
  "glass-btn-fill.png": renderTexture(16, 16, () => [14, 36, 70, 0.88]),
  "glass-alert-card.png": glassAlertCardPng,
  "glass-pill.png": glassPillPng,
  "glass-icon-box.png": glassIconBoxPng,
  "glass-chip.png": glassChipPng,
  "glass-btn.png": glassBtnPng,
  "icon-mail.png": iconMailPng,
  "icon-layers.png": iconLayersPng,
  "icon-shield.png": iconShieldPng,
  "icon-verified.png": iconVerifiedPng,
  "icon-open.png": iconOpenPng,
};

fs.mkdirSync(outPngDir, { recursive: true });
const tsEntries = [];
let totalBytes = 0;

for (const [name, buf] of Object.entries(ASSETS)) {
  fs.writeFileSync(path.join(outPngDir, name), buf);
  totalBytes += buf.length;
  const b64 = buf.toString("base64");
  const chunks = b64.match(/.{1,100}/g) || [""];
  const formattedChunks = chunks.map((c) => `    "${c}"`).join(",\n");
  tsEntries.push(`  "${name}": [\n${formattedChunks}\n  ].join("")`);
}

const tsSource = `// Auto-generated by scripts/generate-email-assets.mjs - do not hand-edit.
export const EMAIL_PNG_ASSETS: Record<string, string> = {
${tsEntries.join(",\n")}
};
`;

fs.writeFileSync(outTsPath, tsSource, "utf8");
fs.writeFileSync(outEdgeTsPath, tsSource, "utf8");
console.log(
  `Generated ${Object.keys(ASSETS).length} PNG assets (${totalBytes} bytes total) -> ${outPngDir}, ${outTsPath} & ${outEdgeTsPath}`
);
