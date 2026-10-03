import { readFileSync } from "node:fs";

function findChunks(buf) {
  const chunks = [];
  let off = 8;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.slice(off + 4, off + 8).toString("ascii");
    chunks.push({ off, len, type });
    if (type === "IEND") break;
    off += 12 + len;
  }
  return chunks;
}

for (const s of ["192", "512"]) {
  const buf = readFileSync(`./public/icons/icon-${s}x${s}.png`);
  const chunks = findChunks(buf);
  console.log(`icon-${s}x${s}.png (${buf.length} bytes):`);
  for (const c of chunks) {
    console.log(`  off=${c.off} len=${c.len} type=${c.type}`);
  }
}
