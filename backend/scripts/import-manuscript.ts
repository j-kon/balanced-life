import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { openDatabase, root } from "../src/db.js";
import { devotionals, monthlyThemes } from "../src/schema.js";
const source = resolve(root, "private/manuscript/devotional-2027.pdf");
if (!existsSync(source))
  throw new Error(
    "Place the original PDF at private/manuscript/devotional-2027.pdf first.",
  );
const bytes = readFileSync(source);
const pdf = await getDocument({
  data: new Uint8Array(bytes),
  useSystemFonts: true,
  isEvalSupported: false,
}).promise;
const pages: { page: number; text: string }[] = [];
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i),
    content = await page.getTextContent();
  let line = "",
    lastY: number | null = null;
  const lines: string[] = [];
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const y = item.transform[5];
    if (y < 25) continue;
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
const months = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];
// Transcribed from the supplied manuscript's monthly theme guide, PDF page 2.
const themes = [
  "Gratitude, Identity & Intentionality",
  "Love, Family, friendship Relationships & Healthy Connections",
  "EMOTIONAL INTELLIGENCE • SELF-AWARENESS • RESILIENCE",
  "ACADEMIC / CAREER EXCELLENCE • SKILLS • CONSISTENCY",
  "SELF-DISCOVERY • CONFIDENCE • PURPOSE • A HABIT OF PRAYER",
  "FINANCIAL WISDOM • WORK • STEWARDSHIP",
  "LEADERSHIP • RESPONSIBILITY • INFLUENCE",
  "HOLINESS • THE FEAR OF GOD • HEALTHY LIVING",
  "LEARNING • DIGITAL DISCIPLINE • OPPORTUNITY",
  "NONCONFORMITY • COURAGE • BEING DIFFERENT IN A CHANGING WORLD.",
  "THE HOLY SPIRIT • SPIRITUAL GIFTS • SERVING GOD",
  "THE FRUIT OF THE SPIRIT • JESUS' BIRTH • GRATITUDE • PRAYER FOR THE NEW YEAR",
];
const combined = pages
  .map((p) => "\n[[PAGE " + p.page + "]]\n" + p.text)
  .join("\n");
const header = new RegExp(
  "^(" +
    months.join("|") +
    ")\\s+(\\d{1,2}),?\\s+2027\\.?\\s*DAILY BIBLE CHALLENGE:\\s*([^\\n]+)",
  "gm",
);
const matches = [...combined.matchAll(header)];
const issues: { date?: string; problem: string }[] = [];
const entries: any[] = [];
const dates = new Set<string>();
const flatten = (text: string) => text.replace(/\s+/g, " ").trim();
for (let i = 0; i < matches.length; i++) {
  const m = matches[i],
    month = months.indexOf(m[1]) + 1,
    date =
      "2027-" + String(month).padStart(2, "0") + "-" + m[2].padStart(2, "0");
  const pageMarkers = [
    ...combined.slice(0, m.index).matchAll(/\[\[PAGE (\d+)\]\]/g),
  ];
  const page = Number(pageMarkers.at(-1)?.[1]);
  let block = combined
    .slice(m.index! + m[0].length, matches[i + 1]?.index ?? combined.length)
    .replace(/\[\[PAGE \d+\]\]/g, "")
    .trim();
  block = block.split(/\nDATE\s+ONE LESSON LEARNT/)[0].trim();
  const parsed = block.match(
    /^([\s\S]*?)\nBIBLE TEXT:\s*([\s\S]*?)\nMEMORY VERSE:\s*([\s\S]*?)\nREFLECT:\s*([\s\S]*?)\nTHINK ABOUT THIS:\s*([\s\S]*?)\nPRAYER:\s*([\s\S]*)$/,
  );
  if (!parsed) {
    issues.push({
      date,
      problem: "Section labels could not be parsed reliably. Page " + page,
    });
    continue;
  }
  if (dates.has(date) || new Date(date).toISOString().slice(0, 10) !== date) {
    issues.push({ date, problem: "Duplicate or invalid date. Page " + page });
    continue;
  }
  dates.add(date);
  let title = flatten(parsed[1]),
    challenge = flatten(m[3]);
  // PDF page 176 wraps the final chapter number onto its own line above the title.
  if (date === "2027-12-09" && /^1\n/.test(parsed[1])) {
    title = flatten(parsed[1].replace(/^1\n/, ""));
    challenge += " 1";
  }
  const entry = {
    date,
    title,
    theme: themes[month - 1],
    bibleText: flatten(parsed[2]),
    memoryVerse: flatten(parsed[3]),
    reflection: flatten(parsed[4]),
    thinkAbout: flatten(parsed[5]),
    prayer: flatten(parsed[6]),
    challenge,
    sample: date === "2027-01-01",
    published: false,
    sourcePages: String(page),
  };
  if (
    [
      entry.title,
      entry.bibleText,
      entry.memoryVerse,
      entry.reflection,
      entry.thinkAbout,
      entry.prayer,
    ].some((v) =>
      /DAILY BIBLE CHALLENGE|BIBLE TEXT:|MEMORY VERSE:|REFLECT:/.test(v),
    )
  )
    issues.push({
      date,
      problem:
        "Unexpected nested section label; do not publish without review.",
    });
  if (
    Object.values(entry).some(
      (v) => typeof v === "string" && v.includes("[[PAGE"),
    )
  )
    issues.push({ date, problem: "Page marker survived extraction." });
  entries.push(entry);
}
for (let day = 0; day < 365; day++) {
  const date = new Date(Date.UTC(2027, 0, 1 + day)).toISOString().slice(0, 10);
  if (!dates.has(date))
    issues.push({
      date,
      problem: "Missing from structured import; requires manual review.",
    });
}
const folder = resolve(root, "private/manuscript/extracted");
mkdirSync(folder, { recursive: true });
writeFileSync(resolve(folder, "pages.json"), JSON.stringify(pages, null, 2));
writeFileSync(
  resolve(folder, "entries.json"),
  JSON.stringify(entries, null, 2),
);
const report = {
  sourceSha256: createHash("sha256").update(bytes).digest("hex"),
  pages: pdf.numPages,
  detected: matches.length,
  parsed: entries.length,
  issues,
  policy:
    "All imported entries are drafts. Only the first seven entries may be published after explicit visual verification. Whitespace is normalized; wording, capitalization, punctuation and source mistakes are retained.",
};
writeFileSync(
  resolve(folder, "import-report.json"),
  JSON.stringify(report, null, 2),
);
if (process.argv.includes("--write")) {
  const store = openDatabase();
  const now = new Date().toISOString();
  store.sqlite.transaction(() => {
    for (const e of entries)
      store.db
        .insert(devotionals)
        .values({ ...e, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
        .run();
    for (let i = 0; i < themes.length; i++)
      store.db
        .insert(monthlyThemes)
        .values({ month: i + 1, title: themes[i] })
        .onConflictDoNothing()
        .run();
  })();
  store.sqlite.close();
}
console.log(JSON.stringify(report, null, 2));
console.log(
  process.argv.includes("--write")
    ? "Drafts imported. Existing edits preserved."
    : "Extraction only. Re-run with --write to import drafts.",
);
