import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

for (const s of ["192", "512"]) {
  const sepia = readFileSync(`./public/icons/icon-${s}x${s}-sepia.png`);
  // IDAT: header at off 8 (IHDR len 13), chunk header after = off 37
  const idatStart = 37;
  const len = sepia.readUInt32BE(33);
  const decompressed = inflateSync(sepia.slice(idatStart, idatStart + len));
  let r = 0,
    g = 0,
    bl = 0;
  for (let i = 0; i < decompressed.length; i += 3) {
    r += decompressed[i];
    g += decompressed[i + 1];
    bl += decompressed[i + 2];
  }
  const n = decompressed.length / 3;
  console.log(
    `icon-${s}x${s}: sepia mean RGB(${Math.round(r / n)},${Math.round(g / n)},${Math.round(bl / n)}) ` +
      `offset=${idatStart} len=${len}`,
  );
}
