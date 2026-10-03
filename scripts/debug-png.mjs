import { readFileSync } from "node:fs";

// PNG signature is 8 bytes
function readU64(buf, off) {
  const lo = BigInt(buf.readUInt32BE(off));
  const hi = BigInt(buf.readUInt32BE(off + 4));
  return Number(lo | (hi << 32n));
}

for (const s of ["192", "512"]) {
  const buf = readFileSync(`./public/icons/icon-${s}x${s}.png`);
  const isPng = readU64(buf, 0) === 0x89504e470d0a1a0an;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[16 + 8];
  const colorType = buf[16 + 9];
  console.log(
    `icon-${s}x${s}.png  magic_ok=${isPng} bytes=${buf.length} width=${width} height=${height} bitdepth=${bitDepth} colortype=${colorType}`,
  );
}
