import sharp from "sharp";
import { mkdirSync } from "node:fs";
mkdirSync("frontend/public/brand", { recursive: true });
for (const name of ["book-cover", "author-profile"])
  await sharp("assets/brand/" + name + ".png")
    .resize({ width: 900, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toFile("frontend/public/brand/" + name + ".png");
for (const size of [192, 512])
  await sharp("frontend/public/icon.svg")
    .resize(size, size)
    .png()
    .toFile("frontend/public/icon-" + size + ".png");
