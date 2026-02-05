import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

// The Nano Banana export we got has a baked-in checkerboard.
// This script removes it deterministically while leaving the logo strokes intact.

const BG_DARK = [170, 174, 173];
const BG_LIGHT = [231, 233, 230];

function dist(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function isGrayish([r, g, b], maxChroma = 22) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx - mn <= maxChroma;
}

function main() {
  const input = process.argv[2] || "public/brand/logo-mark-nanobanana.png";
  const output = process.argv[3] || "public/brand/logo-mark-nanobanana-transparent.png";

  const inPath = path.resolve(process.cwd(), input);
  const outPath = path.resolve(process.cwd(), output);

  const png = PNG.sync.read(fs.readFileSync(inPath));
  const { width, height, data } = png;

  let changed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      const rgb = [r, g, b];

      // Only touch pixels that look like background.
      const d = Math.min(dist(rgb, BG_DARK), dist(rgb, BG_LIGHT));
      if (a === 255 && isGrayish(rgb, 22) && d <= 45) {
        data[idx + 3] = 0;
        changed++;
      }
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, PNG.sync.write(png));

  // alpha stats
  let alphaMin = 255,
    alphaMax = 0;
  for (let i = 3; i < data.length; i += 4) {
    const aa = data[i];
    if (aa < alphaMin) alphaMin = aa;
    if (aa > alphaMax) alphaMax = aa;
  }

  console.log(
    JSON.stringify(
      {
        input,
        output,
        size: { w: width, h: height },
        changedPixels: changed,
        alphaMin,
        alphaMax,
      },
      null,
      2,
    ),
  );
}

main();
