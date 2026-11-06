# Architecture

The root npm workspace starts two independent applications with concurrently. Vite serves the React UI on port 5173 and proxies /api requests to Fastify on port 4000. Browser requests stay same-origin; no permissive CORS is enabled.

## Frontend

React, TypeScript, React Router, Lucide and Tailwind's Vite plugin. The CSS token system uses burgundy #570008, gold #D5A52B, cream #FAF5ED and white. Editorial headings and the reading body use locally available Georgia; interface text uses system sans-serif. No network font or stock-photo dependency.

App.tsx contains public, reader and author screens. api.ts centralizes credentialed API requests and error handling. Navigation and session state are shared through React context. Safe React text rendering prevents user journal text from becoming executable HTML. Mobile layouts use bottom reader navigation and contain wide admin tables within scrollable panels.

The frontend never imports manuscript JSON. Public library metadata exposes only dates, titles, themes, status and sample flags. Reading bodies come from a separately authorized detail endpoint. Production bundles contain UI code and approved branding, not premium devotional bodies.

## Backend

Fastify validates inputs with Zod and uses Drizzle's SQLite driver. Numbered SQL migrations initialize tables and constraints inside transactions; schema.ts mirrors the database mappings. The database opens in WAL mode with foreign keys enabled.

Authentication uses Node scrypt with independent random salts and timing-safe verification. Random 256-bit opaque session tokens are stored hashed in SQLite, expire after seven days, rotate at login and are revoked at logout. Cookies are HTTP-only, SameSite=Strict and Secure in production. No JWT or hardcoded production secret is needed.

Mutations require a custom request header, reject unrecognized Origin values and cross-site requests. Rate limits are global and stricter on authentication, checkout and inquiries. APIs set Cache-Control: no-store. Every protected route enforces server-side authorization. Admin access is role-based; journals are scoped to their owner even for administrators.

Demo role login and simulated payment paths are guarded by demo mode. The API defaults to loopback. Demo data, quick login, and public development credentials must never be used in production.

## Payments

PaymentProvider separates payment authorization from transactional subscription activation. DemoPaymentProvider returns a simulated result only when explicitly available in a development demo. Real integrations must verify the provider's signed event, amount, currency, reference, user and plan before calling a real activation path. This MVP does not claim to provide a live payment implementation.

## Manuscript

The extraction script operates on a private filesystem PDF, identifies dated entries and sections, records source pages and a source SHA-256, and writes private review artifacts. Imports are drafts. The first week has been visually checked and is published by a hash-bound helper. Existing rows are preserved during re-import, so a changed manuscript requires a deliberate revision workflow.

## PWA

A manifest, 192/512px icons and a service worker support installation where browsers permit. Only explicitly listed public icons and the manifest are cached. HTML navigation, API responses, devotionals, journals and session data are never service-worker cached. Offline reading is outside this MVP.

## Known engineering tradeoffs

The demo loads the complete admin collection in one protected request; pagination is a production follow-up. Public metadata status queries use straightforward per-entry lookups, suitable for this 365-entry local archive. SQLite is single-host persistence. Backups, multi-instance sessions/rate limits, observability, accessibility audit and production load testing remain future work.

The Vite development server restricts filesystem serving to frontend/ and node_modules/, with explicit deny patterns for private/, backend/, SQLite, environment files and keys. Browser regression tests assert HTTP 403 for direct /@fs/ attempts against the manuscript, extraction, database and backend source.
