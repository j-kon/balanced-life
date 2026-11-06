# Future deployment checklist — not performed

This document records future work. It does not authorize or perform deployment.

- Obtain the author's approval for branding, biography, prices, terms, content publication and the final 358 manuscript entries.
- Review February 13's extraction anomaly. Validate all Bible references and source typos with the author; do not silently rewrite.
- Select infrastructure and decide whether to retain single-host SQLite or implement/test PostgreSQL migrations.
- Use an entirely fresh production database, remove development accounts and credentials, disable all demo login/payment code, and provision administrators through a secure process.
- Configure HTTPS, Secure cookies, allowed origin, host, trusted proxies, secrets management and production security headers.
- Add verified real payment authorization, signed webhooks, reconciliation, refunds, idempotency and currency checks. Store provider secrets only server-side.
- Add explicit consent and terms for real recurring billing; implement cancellation and renewal notifications before running any real scheduler.
- Add verified email, password reset, account recovery, session management and abuse protection.
- Review privacy and safeguarding requirements for younger readers. Collect only necessary personal data; define journal retention/deletion and account export/deletion policies.
- Add database backups and restore drills, migrations in CI, monitoring, logging redaction and incident handling.
- Add pagination for admin content/payment data, test concurrent purchases and review rate limiting for multiple instances.
- Perform accessibility and cross-browser audits, production performance/load checks and security review.
- Re-run lint, API tests, desktop/mobile browser tests, production build and dependency audits.
- Verify private manuscript files, journal data, demo credentials and development database files are absent from deployed static files.
- Ensure the service worker cannot cache authenticated API responses or journal/private reading data.
- Add approved hardcover inventory, payment and fulfillment processes before representing orders as paid or dispatched.
- Obtain final approval for deployment and production billing. No real Paystack, email or hosting service is currently connected.
