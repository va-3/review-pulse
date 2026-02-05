import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { PNG } from "pngjs";

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function readPng(p) {
  return PNG.sync.read(fs.readFileSync(p));
}

function alphaStats(png) {
  let alphaMin = 255;
  let alphaMax = 0;
  for (let i = 3; i < png.data.length; i += 4) {
    const a = png.data[i];
    if (a < alphaMin) alphaMin = a;
    if (a > alphaMax) alphaMax = a;
  }
  return { alphaMin, alphaMax };
}

function sampleAlpha(png, x, y) {
  const idx = (png.width * y + x) << 2;
  return png.data[idx + 3];
}

function findOpaqueBounds(png, alphaThreshold = 8) {
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

function writePng(p, png) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, PNG.sync.write(png));
}

function sipsResizeSquare(inputPath, outputPath, sizePx) {
  // sips preserves alpha and is available on macOS.
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  execSync(
    `sips -z ${sizePx} ${sizePx} ${JSON.stringify(inputPath)} --out ${JSON.stringify(outputPath)}`,
    { stdio: "ignore" },
  );
}

function main() {
  const root = process.cwd();

  const source =
    process.env.BRAND_SOURCE ||
    process.argv[2] ||
    "public/brand/source/logo-source.png";

  const sourcePath = path.resolve(root, source);
  if (!fs.existsSync(sourcePath)) {
    die(
      `Brand source not found: ${source}\n\nExpected a PNG at public/brand/source/logo-source.png (or set BRAND_SOURCE).`,
    );
  }

  const distDir = path.resolve(root, "public/brand/dist");
  fs.mkdirSync(distDir, { recursive: true });

  const png = readPng(sourcePath);
  const stats = alphaStats(png);

  // Validation gate: must contain transparency.
  if (stats.alphaMin !== 0) {
    die(
      `Brand validation failed: source PNG has no transparency (alphaMin=${stats.alphaMin}).\n` +
        `Regenerate with TRUE transparent background (alpha=0).\n` +
        `Source: ${source}`,
    );
  }

  // Validation: corners should be transparent.
  const corners = {
    tl: sampleAlpha(png, 0, 0),
    tr: sampleAlpha(png, png.width - 1, 0),
    bl: sampleAlpha(png, 0, png.height - 1),
    br: sampleAlpha(png, png.width - 1, png.height - 1),
  };
  const cornerMax = Math.max(corners.tl, corners.tr, corners.bl, corners.br);
  if (cornerMax > 3) {
    die(
      `Brand validation failed: corners are not transparent enough (maxCornerAlpha=${cornerMax}).\n` +
        `This usually means there is a background baked into the image.\n` +
        `Corners: ${JSON.stringify(corners)}\n` +
        `Source: ${source}`,
    );
  }

  // Crop to content.
  const bounds = findOpaqueBounds(png, 8);
  if (!bounds) die("Brand validation failed: no opaque pixels found.");

  const cropped = cropPng(png, bounds, 12);

  const canonicalMark = path.join(distDir, "logo-mark.png");
  writePng(canonicalMark, cropped);

  // Export sizes for UI + platform icons.
  const exports = [
    { name: "logo-mark-32.png", size: 32 },
    { name: "logo-mark-64.png", size: 64 },
    { name: "logo-mark-128.png", size: 128 },
    { name: "apple-touch-icon.png", size: 180 },
    { name: "icon-192.png", size: 192 },
    { name: "icon-512.png", size: 512 },
  ];

  const out = {};
  for (const e of exports) {
    const outPath = path.join(distDir, e.name);
    sipsResizeSquare(canonicalMark, outPath, e.size);
    out[e.name] = `/brand/dist/${e.name}`;
  }

  // Also copy key platform files to /public root for conventional discovery.
  // (favicon.ico can remain separate; we provide PNGs + metadata links.)
  fs.copyFileSync(path.join(distDir, "apple-touch-icon.png"), path.resolve(root, "public/apple-touch-icon.png"));
  fs.copyFileSync(path.join(distDir, "icon-192.png"), path.resolve(root, "public/icon-192.png"));
  fs.copyFileSync(path.join(distDir, "icon-512.png"), path.resolve(root, "public/icon-512.png"));

  // Web manifest (minimal)
  const manifest = {
    name: "ReviewPulse",
    short_name: "ReviewPulse",
    icons: [
      { src: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
  };
  fs.writeFileSync(path.resolve(root, "public/manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");

  // Manifest for the app to consume.
  const brandManifest = {
    source: source.replace(/^\/+/, ""),
    generatedAt: new Date().toISOString(),
    canonicalMark: "/brand/dist/logo-mark.png",
    exports: out,
  };

  fs.writeFileSync(
    path.resolve(root, "public/brand/manifest.json"),
    JSON.stringify(brandManifest, null, 2) + "\n",
  );

  console.log(JSON.stringify({ ok: true, ...brandManifest }, null, 2));
}

main();
