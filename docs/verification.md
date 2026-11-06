# Local verification

Verified on 4 November 2026, using Node 24 and Google Chrome.

- npm run seed: repeatable; 365 structured entries, seven published first-week readings, 358 drafts. Existing edited entries preserved.
- npm run build: frontend production build and backend TypeScript compilation pass.
- npm run lint: frontend/backend TypeScript and ESLint pass.
- npm test: 13 backend tests pass, covering login validation, password hashing, HTTP-only sessions, role protection, guest/subscriber/admin access, draft/sample access, owner-scoped journals, duplicate payment protection, calendar-month expiry, cancellation, renewal, expired sessions/memberships, inactive plans, request-origin protection and production demo-mode rejection.
- Desktop/mobile end-to-end suite: registration, sample reading, subscriber login, bookmarks, completion, journal write/delete, library search, denied premium access, checkout, cancellation, premium unlock, admin editing/search and responsive page widths.
- Filesystem privacy regression: Vite returns 403 for the private PDF, extracted entries, SQLite database and backend source via /@fs/.
- Service-worker cache test: only public icons and manifest are stored.
- Static bundle inspection: devotional reflection bodies are absent from production JavaScript.
- PWA icons: 192 × 192 and 512 × 512 PNG dimensions verified.
- Dependency audit after patching: zero known vulnerabilities.
- Visual review: desktop homepage/administration and mobile dashboard/reading screenshots inspected. First seven readings compared with rendered PDF source pages 5–8.

A rapid repeat of the browser suite triggered the expected per-IP API rate limiter. Leave at least a minute between full runs, or restart the local development processes before an isolated test session. Registration and demo login have longer per-route limits; repeated test sessions should use a fresh development process. Rate limiting remains enabled.

Browser tests use and modify the local demo database. Their test readers have names “Demo Test Reader” and emails starting e2e-. Presentation cleanup removes only those identifiable accounts and their dependent data. The subscriber's first reading remains completed/bookmarked as a useful demonstrated state; test journal reflections are deleted by the tests.

No deployment, GitHub push, real payment or external email was performed. All 358 remaining drafts still require author review. February 13 is explicitly flagged for a repeated source section label.
