import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("./public/logo.svg");
const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 96.81 96.81"><rect width="96.81" height="96.81" rx="18" fill="#f0e6d2"/>${svg.toString().replace(/<svg[^>]*>/,"").replace(/<\/svg>/,"")}</svg>`;
writeFileSync("./public/_probe.svg", wrapper);

(async () => {
  // A) direct render of the filled paper + white glyph
  const direct = await sharp("./public/_probe.svg", { density: 300 }).png().toBuffer();
  console.log("A direct png ok", direct.length);

  // B) grayscale only, NO toBuffer yet
  const monoStream = sharp("./public/_probe.svg", { density: 300 })
    .png().grayscale();
  console.log("B grayscale stream ok", monoStream);

  // C) composite grayscale onto sepia paper
  const paper = sharp(Buffer.from("#f0e6d2")).png().toBuffer();
  const out = await sharp(paper)
    .composite([{ input: monoStream, blend: "over" }])
    .toBuffer();
  console.log("C composite ok", out.length);

  process.exit(0);
})();
