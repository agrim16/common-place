import sharp from "sharp";
import { statSync } from "node:fs";

async function main() {
  for (const s of ["192", "512"]) {
    const m = await sharp(`./public/icons/icon-${s}x${s}.png`).metadata();
    console.log(
      `icon-${s}x${s}.png  w=${m.width} h=${m.height} format=${m.format} bytes=${statSync(`./public/icons/icon-${s}x${s}.png`).size}`,
    );
  }
}

main();
