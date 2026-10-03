import sharp from "sharp";
import { readFileSync } from "node:fs";

for (const s of ["192", "512"]) {
  const buf = readFileSync(`./public/icons/icon-${s}x${s}.png`);
  const m = await sharp(buf).metadata();
  console.log(
    `icon-${s}x${s}.png  w=${m.width} h=${m.height} format=${m.format} ` +
      `bytes=${buf.length} first33hex=${buf.slice(0, 33).toString("hex")}`,
  );
}
