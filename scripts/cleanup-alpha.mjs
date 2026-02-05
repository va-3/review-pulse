import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

function isGrayish(r, g, b, maxChroma = 22) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx - mn <= maxChroma;
}

function findOpaqueBounds(png, alphaThreshold = 6) {
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

function main() {
  const input = process.argv[2] || "public/brand/logo-mark-final.png";
  const output = process.argv[3] || "public/brand/logo-mark-final-v2.png";

  const inPath = path.resolve(process.cwd(), input);
  const outPath = path.resolve(process.cwd(), output);

  const png = PNG.sync.read(fs.readFileSync(inPath));
  const { data } = png;

  let changed = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2],
      a = data[i + 3];

    let na = a;

    // Kill faint haze anywhere.
    if (na < 90) na = 0;

    // Kill gray-ish leftovers even if moderately opaque.
    if (na > 0 && isGrayish(r, g, b, 24) && na < 220) {
      na = 0;
    }

    if (na !== a) {
      data[i + 3] = na;
      changed++;
    }
  }

  const bounds = findOpaqueBounds(png, 6);
  if (!bounds) throw new Error("No opaque pixels after cleanup.");
  const cropped = cropPng(png, bounds, 10);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, PNG.sync.write(cropped));

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
        changedPixels: changed,
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
