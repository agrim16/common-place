/**
 * Pure-Node (no external image libs) sepia tinter for PNG icons.
 * Reads a valid PNG, applies a sepia colour matrix, and writes a valid PNG.
 *
 * Run: node scripts/vintage-icon.cjs
 *
 * Sepia matrix (Wikipedia "Sepia"):
 *   R' = 0.393R + 0.769G + 0.189B
 *   G' = 0.349R + 0.686G + 0.168B
 *   B' = 0.272R + 0.534G + 0.131B
 *
 * NOTE: reads the base PNG IDAT, inflates with zlib, tints RGB, writes a new
 * PNG with correct chunk CRCs. The base PNG must decode to RGB pixels.
 */

const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const { inflateSync, crc32 } = require("node:zlib");

/**
 * Build a PNG chunk: 4-byte length + 4-byte type + data + 4-byte CRC.
 * NOTE: the header is 8 bytes total (4 length + 4 type), NOT 4.
 */
function chunk(type, data) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 0);
  return Buffer.concat([header, data, crc]);
}

function pngDimensions(buf) {
  if (buf.length < 24) return { width: 0, height: 0 };
  // PNG signature is 8 bytes: 89 50 4E 47 0D 0A 1A 0A
  const magic =
    (BigInt(buf.readUInt32BE(0)) << 32n) | BigInt(buf.readUInt32BE(4));
  if (magic !== 0x89504e470d0a1a0an) return { width: 0, height: 0 };
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function tintSepia(inputPath, outputPath) {
  const buf = readFileSync(inputPath);
  const { width, height } = pngDimensions(buf);

  // Scan all chunks to find the IDAT payload. off points at the chunk
  // length field; the IDAT DATA starts after length + type = off + 8.
  let idatStart = -1;
  let idatLen = 0;
  let off = 8;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.slice(off + 4, off + 8).toString("ascii");
    if (type === "IDAT") {
      if (idatStart === -1) idatStart = off + 8;
      idatLen += len;
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }
  if (idatStart === -1) throw new Error("No IDAT chunk found");

  const idat = buf.slice(idatStart, idatStart + idatLen);
  const decompressed = inflateSync(idat);

  // Apply sepia colour matrix to RGB triplets.
  const out = Buffer.alloc(decompressed.length);
  const rawLen = width * height * 3;
  for (let i = 0; i < rawLen; i += 3) {
    const r = decompressed[i];
    const g = decompressed[i + 1];
    const b = decompressed[i + 2];
    out[i] = Math.min(255, Math.round(r * 0.393 + g * 0.769 + b * 0.189));
    out[i + 1] = Math.min(255, Math.round(r * 0.349 + g * 0.686 + b * 0.168));
    out[i + 2] = Math.min(255, Math.round(r * 0.272 + g * 0.534 + b * 0.131));
  }
  if (decompressed.length > rawLen) {
    decompressed.copy(out, rawLen);
  }

  // Rebuild a correct PNG: signature + IHDR + IDAT + IEND, with valid CRCs.
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // colour type 2 = truecolor RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const png = Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdrData),
    chunk("IDAT", out),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  writeFileSync(outputPath, png);
  console.log(`✨ sepia-tinted ${inputPath} -> ${outputPath} (${width}x${height})`);
}

const targetDir = `${process.cwd()}/public/icons`;
if (!existsSync(targetDir)) {
  console.error("No icons dir");
  process.exit(1);
}
for (const s of ["192", "512"]) {
  const inP = `${targetDir}/icon-${s}x${s}.png`;
  const outP = `${targetDir}/icon-${s}x${s}-sepia.png`;
  tintSepia(inP, outP);
}
