# The Balanced Life Devotional

A local full-stack demonstration for **Cossy Teens Consult**, featuring the 2027 devotional by **Mrs. Adindu Ogechukwu Constance Nwisi**.

React + Vite + TypeScript + Tailwind CSS, Fastify + Drizzle ORM + SQLite. No hosted database or payment account is needed. No deployment or GitHub push has been performed.

## Run locally

Requires Node.js **24 LTS** and npm. From the repository root:

```bash
npm install
npm run seed
npm run dev
```

- Website: **http://localhost:5173**
- API health: **http://localhost:4000/api/v1/health**
- Reader: http://localhost:5173/dashboard
- Author administration: http://localhost:5173/admin

Leave the terminal running. Both servers bind to loopback by default. Stop them with Ctrl+C. SQLite data persists under `backend/data/devotional.sqlite`; restarting does not erase journals, payments, or reading progress.

The initial preview reading date is **January 1, 2027**, visibly labeled Demo Preview Mode. The administrator can change this under Administration → Settings. Subscription expiry uses the real clock, independently of the preview date.

## Local demo accounts

These are **development-only**, deliberately public demo credentials. The sign-in screen also has clearly labeled role buttons.

| Role | Email | Password | Access |
| --- | --- | --- | --- |
| Admin | admin@balanced.test | Demo-Admin-2027! | All administration and readings |
| Subscriber | subscriber@balanced.test | Demo-Reader-2027! | Seeded yearly membership |
| Guest | guest@balanced.test | Demo-Guest-2027! | January 1 sample; upgrade using demo checkout |

New registration works too. Each account has its own private journal. Administrators cannot read another account's journal through the admin API.

Seeding is repeatable and preserves existing accounts, edits and subscription state. It does not extend an expired seeded membership on every restart. Use simulated renewal to renew it. Never reuse these credentials or this demo database in production.

## What works

- Branded responsive homepage, About, pricing, bookstore inquiry, login and registration.
- Actual supplied cover and author biography artwork, optimized for the web.
- Reader dashboard, monthly theme filters, search, bookmarks, completion history, private journal.
- Seven visually checked readings for January 1–7, 2027; January 1 is a free sample.
- All **365 entries extracted into structured data**. The other **358 remain drafts** for author review.
- Four editable proposed membership plans with integer kobo prices.
- Clearly labeled simulated checkout, idempotent payment references, membership activation, renewal preferences, cancellation preserving access, manual renewal and payment history.
- Admin overview, subscriber list, devotional creation/editing/publication, pricing controls, payment records, hardcover inquiry status, engagement and audit activity.
- Installable PWA manifest/icons; service worker caches only an explicit public icon/manifest allowlist.
- HTTP-only opaque sessions, password hashing, server-side authorization, request-origin checks, rate limiting, validated inputs and owner-scoped journals.

## Commands

```bash
npm run seed                 # accounts, plans, branding, private manuscript import, reviewed first week
npm run dev                  # frontend + API
npm run build                # frontend production bundle + backend TypeScript compilation
npm run test                 # API, auth, access, privacy and subscription tests (isolated databases)
npm run lint                 # TypeScript checks + ESLint
npm run test:e2e              # Chrome desktop/mobile flows; npm run dev must already be running
npm run import:manuscript     # extract only; does not modify the database
npm run import:manuscript -- --write  # import as drafts, preserve existing entries
npm run prepare:brand        # optimize actual images and regenerate PWA icons
npm audit                    # dependency vulnerability audit (requires network)
```

Browser tests use installed Google Chrome and the local running application. They create identifiable `e2e-…@example.test` readers and demo transactions, update the subscriber's first-day bookmark/completion, and save the first devotional unchanged. Use a disposable demo database if you want these tests entirely separated from a presentation database.

## Manuscript privacy and review

The original PDF is at `private/manuscript/devotional-2027.pdf`. It is never copied into the frontend or served by the API. Raw extraction, structured entries, a SHA-256 provenance hash and review issues are stored only under `private/manuscript/extracted/`.

The importer normalizes layout whitespace and joins PDF text fragments; it does **not** rewrite the author's grammar, capitalization or wording. January 1–7 were compared with rendered PDF pages 5–8. The publication helper is bound to the supplied PDF's exact SHA-256, and refuses an unreviewed replacement.

All remaining entries require editorial review before publication. An extra nested section label was detected in the February 13 source; see `docs/manuscript-review.md`. New imported entries are drafts by default. An administrator can review and publish each in the UI. Premium bodies are absent from the static application bundle and public library metadata.

## Configuration

Defaults work without .env files. Examples are in `backend/.env.example` and `frontend/.env.example`. If needed, copy the backend example to `backend/.env`.

- `HOST`: defaults to 127.0.0.1.
- `PORT`: defaults to 4000.
- `DATABASE_PATH`: SQLite file path; default is backend/data/devotional.sqlite. Relative paths are consistently resolved from backend/, including when seeding from the repository root.
- `DEMO_MODE`: defaults on in development; set false to disable quick demo login and demo checkout.
- `DEMO_REFERENCE_DATE`: initial reading date for a new database. Existing preview settings are changed in administration.
- `APP_ORIGIN`: allowed browser origin, default http://localhost:5173; loopback http://127.0.0.1:5173 is also allowed.
- `NODE_ENV`: production disables demo defaults and makes session cookies Secure. Explicit production + demo mode is rejected.
- `LOG_REQUESTS`: optional true to enable development request logs.

There are no frontend secrets. No real payment provider is connected. The local seed script refuses production and explicit non-demo configurations.

## Documentation

- [Architecture](docs/architecture.md)
- [Database and migrations](docs/database.md)
- [Subscription rules](docs/subscription-logic.md)
- [5–10 minute demo walkthrough](docs/demo-walkthrough.md)
- [Manuscript review notes](docs/manuscript-review.md)
- [Deployment checklist](docs/deployment-checklist.md)

## Scope boundaries

This is a local MVP, not a production release. Real Paystack integration, email/password recovery and verification, audio, native apps, production operations, and physical fulfillment are not implemented. Automatic renewal is modeled but never charges. Prices are proposals. No testimonials were invented. Manuscript copyright and publication decisions remain with the author.

Install support depends on the browser. The app needs the local API online to read devotionals or access journals; private content is intentionally not cached for offline use. For a phone demonstration, use the browser's mobile emulation or separately configure a trusted local-network setup; default loopback servers cannot be reached from another device.

See [verification notes](docs/verification.md) for the tested flows and test-run limits.
