#!/usr/bin/env node
/**
 * Generates vintage-themed Android icons from public/logo.svg (192px + 512px).
 *
 * Replaces the template-default logo.svg icon with a real app icon that reads
 * clearly at small sizes and carries the sepia/aged-paper theme.
 *
 * Run: bun run scripts/generate-icons.ts
 *
 * NOTE: sharp's `composite`/`overlay` transforms are unavailable in this
 * build, so the logo is rendered as a clean white-on-white PNG (the same
 * pipeline that worked in the first successful run), then the pure-Node
 * sepia tint is applied by `vintage-icon.cjs` (which reads the PNG, tints
 * the pixels, and writes a valid PNG back out).
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import sharp from "sharp";

const ROOT = process.cwd();
const LOGO = `${ROOT}/public/logo.svg`;
const OUT_DIR = `${ROOT}/public/icons`;

const THEME = {
  paper: "#f0e6d2", // sepia / aged paper
} as const;

function ensureDir() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
}

/**
 * Render the logo to a clean white-on-white PNG at `size` x `size`.
 *
 * The SVG already carries its own opaque white background rect, so the
 * white glyph comes out crisp and clean. This pipeline is the one that
 * produced valid PNGs in the first successful run.
 */
async function makeIcon(size: number): Promise<Buffer> {
  const tmpSvg = `${ROOT}/public/_tmp_icon_${size}.svg`;
  const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96.81 96.81"><rect width="96.81" height="96.81" rx="18" fill="#f0e6d2"/>${readFileSync(
    LOGO,
    "utf8",
  ).replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "")}</svg>`;
  writeFileSync(tmpSvg, wrapper);

  try {
    return sharp(tmpSvg, { density: 300 })
      .png()
      .flatten({ background: "transparent" })
      .toBuffer();
  } finally {
    try {
      require("node:fs").unlinkSync(tmpSvg);
    } catch {
      // ignore
    }
  }
}

async function main() {
  ensureDir();
  for (const size of [192, 512]) {
    const buf = await makeIcon(size);
    const dest = `${OUT_DIR}/icon-${size}x${size}.png`;
    writeFileSync(dest, buf);
    console.log(`✨ wrote ${dest}`);
  }
}

main();
