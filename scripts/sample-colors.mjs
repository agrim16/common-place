import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

function pngDimensions(buf) {
  if (buf.length < 24) return { width: 0, height: 0 };
  if (buf.readUInt32BE(0) !== 0x89504e470d0a1a0a) return { width: 0, height: 0 };
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function readPngPixelData(buf) {
  let idat = Buffer.alloc(0);
  let off = 8;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.slice(off + 4, off + 8).toString("ascii");
    if (type === "IDAT") idat = Buffer.concat([idat, buf.slice(off + 12, off + 12 + len)]);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  return inflateSync(idat);
}

function meanBrightness(raw) {
  let r = 0,
    g = 0,
    bl = 0;
  for (let i = 0; i < raw.length; i += 3) {
    r += raw[i];
    g += raw[i + 1];
    bl += raw[i + 2];
  }
  const n = raw.length / 3;
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(bl / n) };
}

async function main() {
  for (const s of ["192", "512"]) {
    const base = readFileSync(`./public/icons/icon-${s}x${s}.png`);
    const sepia = readFileSync(`./public/icons/icon-${s}x${s}-sepia.png`);

    const dims = pngDimensions(base);
    const rawB = readPngPixelData(base);
    const rawS = readPngPixelData(sepia);

    const mb = meanBrightness(rawB);
    const ms = meanBrightness(rawS);
    console.log(
      `icon-${s}x${s} (${dims.width}x${dims.height}):` +
        ` base RGB(${mb.r},${mb.g},${mb.b}) -> sepia RGB(${ms.r},${ms.g},${ms.b})` +
        `  (R shift ${ms.r - mb.r})`,
    );
  }
}

main();
