import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("./public/logo.svg");
const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 96.81 96.81"><rect width="96.81" height="96.81" rx="18" fill="#f0e6d2"/>${svg.toString().replace(/<svg[^>]*>/,"").replace(/<\/svg>/,"")}</svg>`;
writeFileSync("./public/_probe.svg", wrapper);

(async () => {
  // Base PNG from the working pipeline
  const base = await sharp("./public/_probe.svg", { density: 300 })
    .png()
    .flatten({ background: "transparent" })
    .toBuffer();
  console.log("base ok len", base.length);

  // Decode to RGBA with .raw() (NO ensureAlpha)
  const raw = await sharp("./public/_probe.svg", { density: 300 })
    .png()
    .raw()
    .toBuffer();
  console.log("raw len", raw.length);

  // Apply sepia tint to raw RGBA
  const tinted = Buffer.from(raw);
  for (let i = 0; i < tinted.length; i += 4) {
    const r = tinted[i];
    const g = tinted[i+1];
    const b = tinted[i+2];
    tinted[i]   = Math.min(255, Math.round(r*0.393 + g*0.769 + b*0.189));
    tinted[i+1] = Math.min(255, Math.round(r*0.349 + g*0.686 + b*0.168));
    tinted[i+2] = Math.min(255, Math.round(r*0.272 + g*0.534 + b*0.131));
  }

  // Re-encode: feed raw RGBA to sharp with explicit .raw() input
  const out = await sharp(tinted)
    .raw()
    .png()
    .toBuffer();
  console.log("re-encoded len", out.length);

  // Check metadata of re-encoded
  const meta = await sharp(out).metadata();
  console.log("meta", JSON.stringify(meta));

  process.exit(0);
})();
