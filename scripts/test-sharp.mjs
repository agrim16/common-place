import sharp from "sharp";
import { writeFileSync, unlinkSync, statSync } from "node:fs";

const OUT = "./public/icons";

function svgFor(size) {
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 96.81 96.81'><rect width='96.81' height='96.81' rx='18' fill='#f0e6d2'/>` +
    "<rect x='24.67' y='24.67' width='47.47' height='11.87' fill='#fff'/>" +
    "<rect x='24.67' y='36.54' width='11.87' height='35.61' fill='#fff'/>" +
    "<rect x='40.06' y='39.98' width='23.74' height='11.87' fill='#fff'/>" +
    "<rect x='40.06' y='51.85' width='11.87' height='20.3' fill='#fff'/>" +
    "</svg>"
  );
}

async function main() {
  for (const size of [192, 512]) {
    const tmp = `./public/_tmp_${size}.svg`;
    const out = `${OUT}/icon-${size}x${size}.png`;
    writeFileSync(tmp, svgFor(size));
    await sharp(tmp, { density: 300 })
      .png()
      .flatten({ background: "transparent" })
      .resize(size, size, { fit: "fill", position: "centre" })
      .toFile(out);
    // sanity: decode raw pixels
    const raw = await sharp(out).raw().toBuffer();
    let sum = 0,
      n = 0;
    for (let i = 0; i < raw.length && n < 1000; i += 4) {
      sum += raw[i];
      n++;
    }
    console.log(
      "size",
      size,
      "png bytes",
      statSync(out).size,
      "meanR",
      Math.round(sum / n),
    );
    unlinkSync(tmp);
  }
}
main();
