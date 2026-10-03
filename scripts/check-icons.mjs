import sharp from "sharp";
import { statSync } from "node:fs";

async function main() {
  for (const s of ["192", "512"]) {
    const me = await sharp(`./public/icons/icon-${s}x${s}.png`).metadata();
    console.log(
      `icon-${s}x${s}.png  w=${me.width} h=${me.height} bytes=${statSync(`./public/icons/icon-${s}x${s}.png`).size}`,
    );
  }
}

main();
