import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const BG_DARK = [170, 174, 173];
const BG_LIGHT = [231, 233, 230];

function dist(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function isGrayish([r, g, b], maxChroma = 18) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx - mn <= maxChroma;
}

function findOpaqueBounds(png, alphaThreshold = 12) {
  const { width, height, data } = png;
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const a = data[idx + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX === -1) return null;
  return { minX, minY, maxX, maxY };
}

function cropPng(png, bounds, pad = 0) {
  const { width, height } = png;
  const minX = Math.max(0, bounds.minX - pad);
  const minY = Math.max(0, bounds.minY - pad);
  const maxX = Math.min(width - 1, bounds.maxX + pad);
  const maxY = Math.min(height - 1, bounds.maxY + pad);

  const outW = maxX - minX + 1;
  const outH = maxY - minY + 1;
  const out = new PNG({ width: outW, height: outH });

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const srcIdx = (png.width * (minY + y) + (minX + x)) << 2;
      const dstIdx = (outW * y + x) << 2;
      out.data[dstIdx] = png.data[srcIdx];
      out.data[dstIdx + 1] = png.data[srcIdx + 1];
      out.data[dstIdx + 2] = png.data[srcIdx + 2];
      out.data[dstIdx + 3] = png.data[srcIdx + 3];
    }
  }

  return out;
}

function removeCheckerboard(png, opts) {
  const { bgDistance = 36, maxChroma = 22, borderBand = 90, borderDistance = 70 } = opts;

  const { data, width, height } = png;
  let removed = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const rgb = [data[idx], data[idx + 1], data[idx + 2]];
      const d = Math.min(dist(rgb, BG_DARK), dist(rgb, BG_LIGHT));
      const isBorder = x < borderBand || y < borderBand || x > width - 1 - borderBand || y > height - 1 - borderBand;

      // This file has an opaque checkerboard baked in.
      // 1) Remove near-gray pixels close to checker colors (soft alpha to preserve edges)
      // 2) Additionally, nuke the outer border band harder to ensure we can crop.

      let a = data[idx + 3];

      if (isGrayish(rgb, maxChroma) && d <= bgDistance) {
        // Soft feather: d=0 => alpha 0; d=bgDistance => alpha unchanged
        const t = Math.min(1, d / bgDistance);
        const feathered = Math.round(255 * t * t);
        a = Math.min(a, feathered);
      }

      if (isBorder && d <= borderDistance) {
        a = 0;
      }

      if (a !== data[idx + 3]) {
        data[idx + 3] = a;
        removed++;
      }
    }
  }

  return { removed };
}

function main() {
  const input = process.argv[2] || "public/brand/2026-02-04-logo-b-purple.png";
  const output = process.argv[3] || "public/brand/logo-mark-tight.png";

  const inPath = path.resolve(process.cwd(), input);
  const outPath = path.resolve(process.cwd(), output);

  const buf = fs.readFileSync(inPath);
  const png = PNG.sync.read(buf);

  const rc = removeCheckerboard(png, {
    bgDistance: 36,
    maxChroma: 22,
    borderBand: 120,
    borderDistance: 90,
  });

  const bounds = findOpaqueBounds(png, 12);
  if (!bounds) throw new Error("No opaque pixels found after background removal.");

  const cropped = cropPng(png, bounds, 10);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, PNG.sync.write(cropped));

  // alpha stats
  let alphaMin = 255,
    alphaMax = 0;
  for (let i = 3; i < cropped.data.length; i += 4) {
    const a = cropped.data[i];
    if (a < alphaMin) alphaMin = a;
    if (a > alphaMax) alphaMax = a;
  }

  console.log(
    JSON.stringify(
      {
        input,
        output,
        inputSize: { w: png.width, h: png.height },
        removedPixels: rc.removed,
        bounds,
        outputSize: { w: cropped.width, h: cropped.height },
        alphaMin,
        alphaMax,
      },
      null,
      2,
    ),
  );
}

main();
