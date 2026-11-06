# Manuscript import and review

Source: private/manuscript/devotional-2027.pdf, 187 PDF pages.
SHA-256: e0532ceead4dd0bab9741237f9216d626412714353faaf0fc75ec93dbb2e2b07

All 365 dates were detected and structurally extracted. January 1–7 were checked visually against rendered PDF pages 5–8 and published for the local demonstration. January 1 alone is the free sample. The other 358 entries remain drafts, requiring author review.

## Extraction decisions

- The PDF can split a word into separate text drawing fragments, such as “pa” + “use”. Fragments are concatenated without invented spaces. Existing whitespace and line wraps are normalized into readable paragraphs.
- Footer slogans and blank printed tracker tables are removed from the structured devotional fields.
- REFLECT is mapped to the UI's Reflection field without rewriting its contents.
- Daily Bible Challenge is shown as its own reading section even though it appears in the printed date header.
- Monthly themes were transcribed from PDF page 2; capitalization and wording are retained, with layout spacing normalized.
- February 18 and 19 have a period after 2027; some other headers have no separating space. The parser supports both.
- December 9 (PDF page 176) wraps the final challenge chapter number “1” onto a separate line above its title. The explicitly documented extraction rule attaches that chapter number to the challenge, rather than to the title.
- First-week source capitalization, grammar and punctuation were retained. January 1's additional “Take out time…” sentence remains in the prayer field; no source sentence was discarded.
- Source Bible references are reproduced as supplied, without theological/editorial corrections.

## Manual review queue

February 13 contains an unexpected nested section label in its extracted fields. It remains unpublished. Inspect the exact source layout and correct the structured field boundaries before publication. The machine report is private/manuscript/extracted/import-report.json; raw page text and entries.json are alongside it.

Structural completeness is not a claim of editorial verification. Review every remaining draft against the original. The original PDF and full extraction remain private; no public download is provided.

The publication helper checks the exact PDF hash. It must not be reused to approve a revised manuscript without a fresh review. Re-import preserves existing database entries rather than overwriting author edits.
