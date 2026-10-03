#!/usr/bin/env node
/**
 * Generates vintage-themed Android icons from public/logo.svg (192px + 512px).
 *
 * Replaces the template-default logo.svg icon with a real app icon that reads
 * clearly at small sizes and carries the sepia/aged-paper theme.
 *
 * Run: bun run scripts/make-icons.cjs
 *
 * NOTE: sharp's composite/overlay transforms are unavailable in this build,
 * so the logo is rendered as a clean white-on-white PNG (the pipeline that
 * worked in the first successful run), then the pure-Node sepia tint is
 * applied by vintage-icon.cjs.
 */

const sharp = require("sharp");
const {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  unlinkSync,
} = require("node:fs");

const ROOT = process.cwd();
const LOGO = `${ROOT}/public/logo.svg`;
const OUT_DIR = `${ROOT}/public/icons`;

function wrapper(size) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96.81 96.81"><rect width="96.81" height="96.81" rx="18" fill="#f0e6d2"/>` +
    readFileSync(LOGO, "utf8").replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "") +
    "</svg>"
  );
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  for (const size of [192, 512]) {
    const svg = wrapper(size);
    const tmp = `${ROOT}/public/_tmp_icon_${size}.svg`;
    writeFileSync(tmp, svg);
    // Working pipeline: render to PNG, flatten onto transparent.
    const png = await sharp(tmp, { density: 300 })
      .png()
      .flatten({ background: "transparent" })
      .resize(size, size, { fit: "fill", position: "centre" })
      .toBuffer();
    const dest = `${OUT_DIR}/icon-${size}x${size}.png`;
    writeFileSync(dest, png);
    console.log(`✨ wrote ${dest} (${size}x${size})`);
    unlinkSync(tmp);
  }
}

main();
