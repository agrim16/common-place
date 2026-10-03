import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("./public/logo.svg");
const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 96.81 96.81"><rect width="96.81" height="96.81" rx="18" fill="#f0e6d2"/>${svg.toString().replace(/<svg[^>]*>/,"").replace(/<\/svg>/,"")}</svg>`;
writeFileSync("./public/_probe.svg", wrapper);

(async () => {
  // proven working pipeline from first successful run
  const png = await sharp("./public/_probe.svg", { density: 300 })
    .png()
    .flatten({ background: "transparent" })
    .toBuffer();
  console.log("PNG ok", png.length);

  // blend the transparent PNG over a sepia paper tile -> try flatten with colour
  const out = await sharp(Buffer.from("#f0e6d2"))
    .flatten({ background: "transparent" })
    .overlay({ input: png })
    .toBuffer();
  console.log("overlay ok", out.length);
  process.exit(0);
})();
