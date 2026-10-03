import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("./public/logo.svg");
const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 96.81 96.81"><rect width="96.81" height="96.81" rx="18" fill="#f0e6d2"/>${svg.toString().replace(/<svg[^>]*>/,"").replace(/<\/svg>/,"")}</svg>`;
writeFileSync("./public/_probe.svg", wrapper);

(async () => {
  const png = await sharp("./public/_probe.svg", { density: 300 })
    .png()
    .flatten({ background: "transparent" })
    .toBuffer();
  console.log("PNG ok", png.length);

  // flatten with a colour background = blend the white glyph over the paper
  const out = await sharp(Buffer.from("#f0e6d2"))
    .flatten({ background: "#f0e6d2" })
    .overlay({ input: png })
    .toBuffer();
  console.log("flatten-colour ok", out.length);
  process.exit(0);
})();
