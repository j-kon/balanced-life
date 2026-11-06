import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";
const pdf = await getDocument({
  data: new Uint8Array(readFileSync("private/manuscript/devotional-2027.pdf")),
  useSystemFonts: true,
  isEvalSupported: false,
}).promise;
for (const n of [5, 6, 7, 8]) {
  const page = await pdf.getPage(n),
    viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(viewport.width, viewport.height);
  await page.render({
    canvasContext: canvas.getContext("2d"),
    canvas,
    viewport,
  }).promise;
  writeFileSync(
    "tmp/manuscript-page-" + n + ".png",
    canvas.toBuffer("image/png"),
  );
}
