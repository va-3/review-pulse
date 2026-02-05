import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

function findOpaqueBounds(png, alphaThreshold = 40) {
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
  const input = process.argv[2] || "public/brand/2026-02-04-logo-b-purple.png";
  const output = process.argv[3] || "public/brand/logo-mark-tight.png";
  const pad = Number(process.argv[4] || 14);

  const inPath = path.resolve(process.cwd(), input);
  const outPath = path.resolve(process.cwd(), output);

  const buf = fs.readFileSync(inPath);
  const png = PNG.sync.read(buf);
  const bounds = findOpaqueBounds(png);
  if (!bounds) throw new Error("No opaque pixels found; image appears fully transparent.");

  const cropped = cropPng(png, bounds, pad);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, PNG.sync.write(cropped));

  const report = {
    input,
    output,
    pad,
    inputSize: { w: png.width, h: png.height },
    bounds,
    outputSize: { w: cropped.width, h: cropped.height },
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
