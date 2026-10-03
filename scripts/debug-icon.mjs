import sharp from "sharp";
import { readFileSync } from "node:fs";

async function main() {
  const buf = readFileSync("./public/icons/icon-192x192.png");
  // use sharp to sample centre pixel
  const px = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  console.log("sharp metadata:", await sharp(buf).metadata());
  // sample a grid
  for (let y = 0; y < 12; y += 3) {
    let row = "";
    for (let x = 0; x < 24; x += 3) {
      const i = (y * 24 + x) * 4;
      const r = buf[i];
      const g = buf[i + 1];
      const b = buf[i + 2];
      const a = buf[i + 3];
      row += a > 100 ? "#" : ".";
    }
    console.log(row);
  }
}

main();
