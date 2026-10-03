/**
 * Pure-Node (no sharp) post-processor that applies a sepia colour matrix
 * to the raw RGB data of a PNG. Linux has no ImageMagick/rsvg binaries, so
 * this is the reliable way to tint the white-on-white logo glyph into a
 * vintage sepia icon.
 *
 * Run: bun run scripts/vintage-icon.mjs <input.png> <output.png>
 *
 * Sepia matrix (from https://en.wikipedia.org/wiki/Sepia):
 *   R' = 0.393R + 0.769G + 0.189B
 *   G' = 0.349R + 0.686G + 0.168B
 *   B' = 0.272R + 0.534G + 0.131B
 * Clamped to 255.
 */

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require("node:fs");

// PNG IHDR: bytes 16-23 hold width (4) and height (4) as big-endian u32.
function pngDimensions(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Read a PNG, apply sepia, write a new PNG with the same header but RGB data.
function tintSepia(inputPath, outputPath) {
  const buf = readFileSync(inputPath);
  const { width, height } = pngDimensions(buf);
  const rawLen = (width * height) * 3;

  // Confirm this is a PNG (IHDR magic)
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.slice(12, 16).toString("ascii") !== "IHDR") {
    throw new Error(`${inputPath} is not a PNG`);
  }

  // Chunk type bytes 8-11
  const chunkLen = buf.readUInt32BE(8);
  const chunkType = buf.slice(12, 16).toString("ascii");

  if (chunkType !== "IHDR" || chunkLen !== 13) {
    throw new Error(`Unexpected IHDR chunk at offset 8: len=${chunkLen} type=${chunkType}`);
  }

  // Bit depth (25) and color type (24): bytes 24-25 (big-endian u16 at offset 24).
  const bitDepth = buf.readUInt16BE(24);
  const colorType = buf.readUInt16BE(25);

  // This implementation assumes colour type 2 (truecolor RGB) and bit depth 8.
  // PNG colour type 6 = RGBA (alpha), 2 = RGB, 0 = greyscale.
  // We only tint RGB triplets; if a footer IDAT is alpha, we discard it
  // (output as opaque RGB).
  const channels = colorType === 6 ? 4 : 3;
  const rawOffset = 8 + 12 + chunkLen; // end of IHDR chunk (excluding CRC)

  // Scan chunks to find the IDAT payload.
  let idatStart = -1;
  let idatLen = 0;
  let off = rawOffset;
  while (off + 8 <= buf.length) {
    const cl = buf.readUInt32BE(off);
    const ct = buf.slice(off + 4, off + 8).toString("ascii");
    if (ct === "IDAT") {
      if (idatStart === -1) idatStart = off + 8;
      idatLen += cl;
    }
    if (ct === "IEND") break;
    off += 12 + cl;
  }
  if (idatStart === -1) throw new Error("No IDAT chunk found");

  const idatBuf = buf.slice(idatStart, idatStart + idatLen);
  const decompressed = zlib.inflateSync(idatBuf);
  if (decompressed.length < rawLen) {
    throw new Error(`Decompressed IDAT too short: ${decompressed.length} < ${rawLen}`);
  }

  // Apply sepia colour matrix to RGB triplets.
  const out = Buffer.alloc(decompressed.length);
  for (let i = 0; i < rawLen; i += 3) {
    const r = decompressed[i];
    const g = decompressed[i + 1];
    const b = decompressed[i + 2];
    out[i] = Math.min(255, Math.round(r * 0.393 + g * 0.769 + b * 0.189));
    out[i + 1] = Math.min(255, Math.round(r * 0.349 + g * 0.686 + b * 0.168));
    out[i + 2] = Math.min(255, Math.round(r * 0.272 + g * 0.534 + b * 0.131));
  }
  // Copy any trailing bytes (e.g. extra IDAT data).
  if (decompressed.length > rawLen) {
    decompressed.copy(out, rawLen);
  }

  // Rebuild a PNG: same IHDR, same bit/colour type, IDAT of tint data, IEND.
  // CRC is placeholder (PNG parsers ignore CRC mismatches for our purposes,
  // and we are not re-embedding into a signed APK by test tooling).
  const header = Buffer.alloc(8 + 13);
  header.write("89504e470d0a1a0a", 0, 8, "hex");
  // IHDR data: width(4) height(4) bitdepth(1) colortype(1) compression(1) filt(1) interlace(1)
  header.writeUInt32BE(width, 8);
  header.writeUInt32BE(height, 12);
  header[16] = 8; // bit depth
  header[17] = colorType; // 2 = truecolor RGB
  header[18] = 0; // compression
  header[19] = 0; // filter
  header[20] = 0; // interlace
  // CRC placeholder (4 bytes) for IHDR
  header[21] = 0;
  header[22] = 0;
  header[23] = 0;
  header[24] = 0;
  header[25] = 0;

  // Build chunks and concatenate
  const chunks = [];
  // IHDR chunk
  const ihdrData = Buffer.alloc(21);
  header.copy(ihdrData, 0, 8, 29);
  chunks.push(chunkData("IHDR", ihdrData));
  // IDAT chunk
  const idatChunk = chunkData("IDAT", out);
  chunks.push(idatChunk);
  // IEND chunk
  chunks.push(chunkData("IEND", Buffer.alloc(0)));

  const png = Buffer.concat(chunks);
  writeFileSync(outputPath, png);
  console.log(`✨ sepia-tinted ${inputPath} -> ${outputPath}`);
}

function chunkData(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  // CRC over type + data
  const crc = zlib.crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const zlib = require("node:zlib");

const targetDir = process.cwd() + "/public/icons";
if (!existsSync(targetDir)) {
  console.error("No icons dir");
  process.exit(1);
}
for (const s of ["192", "512"]) {
  const inP = `${targetDir}/icon-${s}x${s}.png`;
  const outP = `${targetDir}/icon-${s}x${s}-sepia.png`;
  tintSepia(inP, outP);
}
