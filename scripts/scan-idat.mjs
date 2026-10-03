import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

for (const s of ["192", "512"]) {
  const buf = readFileSync(`./public/icons/icon-${s}x${s}.png`);
  let off = 8;
  let idatStart = -1;
  let idatLen = 0;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.slice(off + 4, off + 8).toString("ascii");
    if (type === "IDAT") {
      if (idatStart === -1) idatStart = off + 4;
      idatLen = len;
    } else if (type === "IEND") break;
    off += 12 + len;
  }
  const idat = buf.slice(idatStart, idatStart + idatLen);
  console.log(
    `icon-${s}x${s}.png  idatStart=${idatStart} idatLen=${idatLen} first8hex=${idat.slice(0, 8).toString("hex")}`,
  );
  try {
    const d = inflateSync(idat);
    console.log(`  INFLATE OK, decompressed len=${d.length}`);
  } catch (e) {
    console.log(`  INFLATE FAIL: ${e.message}`);
  }
}
