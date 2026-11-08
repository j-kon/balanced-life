# The Balanced Life Devotional

Production-oriented full-stack web application and mobile Progressive Web App (PWA) for **Cossy Teens Consult Enterprises** (*Building Minds. Shaping Character. Creating Balanced Lives.*), featuring the 2027 daily devotional by **Mrs. Adindu Ogechukwu Constance Nwisi**.

Built with **React 19, Vite, TypeScript, and Tailwind CSS** on the frontend, and **Fastify, TypeScript, Drizzle ORM, SQLite, and Zod** on the backend.

## Repository Structure

```text
balanced-life/
  frontend/             # React + Vite + TypeScript client application & E2E tests
  backend/              # Fastify + Drizzle + SQLite API, migrations, CLI scripts & tests
  private/
    manuscript/         # Private PDF manuscript and structured extraction (never served publicly)
  package.json          # Workspace scripts and shared dev dependencies
  package-lock.json
  README.md
  .gitignore
```

## Quick Start (Local Development)

Requires **Node.js 24 LTS** and npm. From the repository root:

```bash
npm install
npm run db:migrate
npm run dev
```

- **Frontend Application**: http://127.0.0.1:5173
- **API Base URL**: http://127.0.0.1:4000/api/v1
- **Health Check**: http://127.0.0.1:4000/api/v1/health

Both servers start together via `npm run dev` and persist all data in `backend/data/devotional.sqlite` across restarts.

## Creating an Administrator Account

No public demo credentials or quick-login shortcuts exist. To create or promote a local administrator account, run the one-time interactive CLI bootstrap command:

```bash
npm run admin:create
```

Or pass flags directly:

```bash
npm run admin:create -- --name "Mrs. Adindu Nwisi" --email "admin@cossyteens.org" --password "YourStrongPassword123!"
```

Passwords are hashed using Node's `crypto.scrypt` with a 16-byte random salt and verified in constant time via `timingSafeEqual`.

## Root Commands

```bash
npm install                      # Install workspace dependencies
npm run db:migrate               # Apply SQLite migrations and initialize default plans/themes/settings
npm run admin:create             # Create or promote an administrator account securely
npm run dev                      # Start backend API (port 4000) and frontend Vite server (port 5173)
npm run build                    # Typecheck and build both frontend and backend for production
npm run test                     # Run backend unit, integration, security, and subscription test suites
npm run lint                     # Run TypeScript compiler checks and ESLint across workspaces
npm run test:e2e                 # Run Playwright browser E2E and privacy tests (with npm run dev running)
npm run notifications:run        # Run one background reminder & Web Push dispatch cycle (cron-compatible)
npm run notifications:worker     # Run continuous background reminder & Web Push worker
npm run push:generate-vapid      # Generate a fresh VAPID public/private key pair for Web Push
npm run import:manuscript        # Inspect extracted 2027 devotional entries from private/manuscript/
npm run import:manuscript -- --write  # Import missing manuscript entries as unreviewed drafts
```

## Key Architecture & Domain Rules

### 1. Authentication & Accounts
- Real reader registration (`/register`), login (`/login`), logout, profile updates, and password updates (`/app/account`).
- HTTP-only, `SameSite=Lax` opaque session cookies (`balanced_session`, SHA-256 hashed in SQLite `sessions`).
- Account recovery flow (`/forgot-password` and `/reset-password`) backed by hashed, expiring single-use tokens in `password_reset_tokens` and an email provider abstraction (`PASSWORD_RESET_WEBHOOK_URL`).
- Strict server-side role checks (`requireUser`, `requireAdmin`) and account suspension enforcement (`status: 'active' | 'suspended'`).

### 2. 2027 Devotional Content & Editorial Workflow
- Covers **January 1 through December 31, 2027** (365 entries).
- **7 entries** (`2027-01-01` through `2027-01-07`) are editorially verified and published; `2027-01-01` serves as the open sample devotional.
- **358 entries** remain stored as `draft` until reviewed and approved by an administrator in `/app/admin` (including `2027-02-13`, which is flagged `needs_revision` with editorial notes).
- Uses the real system clock. Before January 1, 2027, the application displays upcoming-year messaging while allowing readers to preview the January 1 sample and eligible subscribers to browse published archive entries.
- Full devotional content (`reflection`, `thinkAbout`, `prayer`, `challenge`) is stripped on the server for locked entries.
- The original PDF (`private/manuscript/devotional-2027.pdf`) is never copied to public assets or exposed over HTTP.

### 3. Commerce: Printed Copy, Digital Edition, Memberships & Bulk Orders
- **Printed Copy (₦5,000)**: Ordered via `/bookstore` with delivery inquiries tracked in `/admin` (`Bookstore` tab).
- **2027 Digital Edition (₦3,500)**: Dedicated one-time purchase (`/digital-edition`) granting persistent online access to all published 2027 devotionals (`digital_purchases` and `digital_entitlements`), separate from recurring subscriptions. Supports instant Paystack checkout & webhooks plus optional admin-reconciled Access Bank transfer checkout (`bankTransferEnabled` false by default pending owner approval).
- **Bulk & Institutional Orders (`/bulk-orders`)**: Dedicated workflow for parents, schools, churches, and youth organizations with admin quotation, custom discount percentage, conversion, and fulfillment tracking (`bulk_orders`).
- **Provisional Digital Membership Plans (`/pricing`)**:
  - **Monthly Plan**: ₦1,000
  - **Quarterly Plan**: ₦2,700
  - **Six-Month Plan**: ₦4,800
  - **Yearly Plan**: ₦8,500
- When `PAYSTACK_SECRET_KEY` is not configured, online payment initiation returns HTTP `503` and the UI displays an honest configuration state—no simulated or fabricated payment successes occur.
- Administrators can grant or revoke **Complimentary Membership** (`access_type = 'complimentary'`) with an audit note via `/admin`. Complimentary memberships unlock subscriber readings for local testing and ministry gifts, are explicitly labeled in the UI, and are **never counted as verified payment revenue**.

### 4. 5-Step Daily Growth & Accountability Experience + Mobile PWA
- Structured around the 5-step daily growth framework: **1. Connect with Jesus**, **2. Learn**, **3. Reflect**, **4. Apply**, and **5. Track Your Growth**.
- Each devotional reading includes a private **Daily Growth & Accountability** check-in recording **Today's lesson** (`lesson_learned`), **Personal reflection** (`body`), **Practical action step** (`action_step`), and **Completion status**.
- All journal entries are strictly scoped to the authenticated owner (`user_id`); administrative endpoints never expose private reader journal bodies.
- Installable Mobile PWA (`manifest.webmanifest` + `sw.js`) with Android `beforeinstallprompt` banner, iPhone Safari Add to Home Screen instructions, standalone safe-area layout, and battery-conscious reminder preferences (`/account`).

## Environment Configuration

Copy `backend/.env.example` to `backend/.env` (and optionally `frontend/.env.example` to `frontend/.env`) to customize local settings:

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `HOST` | `127.0.0.1` | Backend bind address |
| `PORT` | `4000` | Backend HTTP port |
| `DATABASE_PATH` | `data/devotional.sqlite` | SQLite database path (relative to `backend/`) |
| `APP_ORIGIN` | `http://localhost:5173` | Allowed CORS/CSRF browser origin (`127.0.0.1:5173` also allowed in dev) |
| `PAYSTACK_SECRET_KEY` | *(empty)* | Live or test `sk_...` key to enable Paystack checkout |
| `PAYSTACK_PUBLIC_KEY` | *(empty)* | Optional `pk_...` public key exposed to the client |
| `PAYSTACK_WEBHOOK_SECRET` | *(empty)* | Optional webhook signing secret (defaults to `PAYSTACK_SECRET_KEY`) |
| `PASSWORD_RESET_WEBHOOK_URL` | *(empty)* | Transactional email webhook URL to enable password-reset emails |
| `EMAIL_FROM` | `no-reply@cossyteens.org` | Sender address for transactional emails |
| `VAPID_PUBLIC_KEY` | *(empty)* | URL-safe Base64 VAPID public key for Web Push subscriptions |
| `VAPID_PRIVATE_KEY` | *(empty)* | Server-only VAPID private key (never exposed to browser) |
| `VAPID_SUBJECT` | `mailto:cossyteensconsult@gmail.com` | Contact URI (`mailto:` or `https://`) for Web Push services |
| `ENABLE_NOTIFICATION_SCHEDULER` | `false` | Set `true` to run the periodic reminder scheduler inside the API process |
| `NOTIFICATION_WORKER_INTERVAL_MS` | `60000` | Polling interval in milliseconds when in-process scheduler or worker loop runs |

## Web Push & Background Notification Scheduler

1. **Generate VAPID Keys**:
   ```bash
   npm run push:generate-vapid
   ```
   Copy `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` into `backend/.env`.
2. **Run Background Scheduler Locally or via Cron**:
   - **One-shot cron execution** (evaluates due reminders across all active users and dispatches pending Web Push messages):
     ```bash
     npm run notifications:run
     ```
   - **Continuous background worker**:
     ```bash
     npm run notifications:worker
     ```
   - **In-process API scheduler**: set `ENABLE_NOTIFICATION_SCHEDULER=true` in `backend/.env`.
3. **Testing Push Notifications on Android & iPhone**:
   - **Android (Chrome / Edge)**: Over `localhost` (development) or `HTTPS` (production), sign in and open **Account & reminders** (`/account`), click **Enable push on this device**, accept the browser prompt, and click **Send test notification**.
   - **iPhone / iPad (iOS 16.4+ Safari)**: Apple requires Web Push to run inside an installed Home Screen web app served over **HTTPS**. Open the site in Safari over HTTPS, tap **Share → Add to Home Screen**, launch the app from the Home Screen icon, open **Account & reminders** (`/account`), tap **Enable push on this device**, and tap **Send test notification**.
