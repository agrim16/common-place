import sharp from "sharp";
import { readFileSync } from "node:fs";

for (const s of ["192", "512"]) {
  const buf = readFileSync(`./public/icons/icon-${s}x${s}-sepia.png`);
  const m = await sharp(buf).metadata();
  console.log(
    `sepia icon-${s}x${s}.png  bytes=${buf.length} format=${m.format} w=${m.width} h=${m.height} ` +
      `channels=${m.channels} depth=${m.bitsPerSample}`,
  );
}
