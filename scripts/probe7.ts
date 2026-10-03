import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const svg = readFileSync("./public/logo.svg");
const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 96.81 96.81"><rect width="96.81" height="96.81" rx="18" fill="#f0e6d2"/>${svg.toString().replace(/<svg[^>]*>/,"").replace(/<\/svg>/,"")}</svg>`;
writeFileSync("./public/_probe.svg", wrapper);

async function main() {
  // .png() only, no flatten
  const a = await sharp("./public/_probe.svg", { density: 300 }).png().toBuffer();
  console.log("A png() only len", a.length);

  // .png().flatten with transparent (first successful version)
  const b = await sharp("./public/_probe.svg", { density: 300 })
    .png().flatten({ background: "transparent" }).toBuffer();
  console.log("B flatten transparent len", b.length);

  // .png().flatten with a solid colour background
  const c = await sharp("./public/_probe.svg", { density: 300 })
    .png().flatten({ background: "#f0e6d2" }).toBuffer();
  console.log("C flatten sepia len", c.length);

  // Try sharp metadata on A
  if (a.length > 0) {
    const ma = await sharp(Buffer.from(a)).metadata();
    console.log("meta A", JSON.stringify(ma));
  }

  process.exit(0);
}
main();
