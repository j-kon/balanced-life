import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const pdf = await getDocument({
  data: new Uint8Array(readFileSync("private/manuscript/devotional-2027.pdf")),
  useSystemFonts: true,
}).promise;
const pages = [];
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const text = await page.getTextContent();
  let lines = [],
    line = "",
    lastY = null;
  for (const item of text.items) {
    if (!("str" in item)) continue;
    const y = item.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 3 && line) {
      lines.push(line.trim());
      line = "";
    }
    line += item.str;
    lastY = y;
  }
  if (line) lines.push(line.trim());
  pages.push({ page: i, text: lines.join("\n") });
}
mkdirSync("private/manuscript/extracted", { recursive: true });
writeFileSync(
  "private/manuscript/extracted/pages.json",
  JSON.stringify(pages, null, 2),
);
console.log("Pages:", pages.length);
console.log(
  pages
    .slice(0, 16)
    .map((p) => "--- PAGE " + p.page + " ---\n" + p.text)
    .join("\n"),
);
