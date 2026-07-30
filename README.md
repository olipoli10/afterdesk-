# Second Shift

Second Shift is an operator-mediated marketplace for asynchronous administrative
work. Clients approve a fixed price before work starts; vetted specialists see
only the worker payout; the operator controls identity separation, quality
review, revisions, disputes, refunds and payouts.

This repository is a Next.js 16.2 application backed by PostgreSQL and Prisma.
It includes the client, specialist and operator experiences, Stripe Checkout,
email verification and notification delivery, file inspection, an academy and
the operational maintenance endpoint.

## Local setup

Requirements: Node.js 22+, npm and PostgreSQL. Prisma's local database can be
used for development.

```bash
npm install
Copy-Item .env.example .env

# In a separate terminal:
npx prisma dev

# Back in the application terminal:
npm run db:migrate
npm run db:seed
npm run dev
```

The seed requires `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`. There is no
public admin sign-up. Client registration is at `/register`; specialist
applications are at `/register/va`.

Without `RESEND_API_KEY`, development emails are printed in the server
terminal. Card checkout is unavailable until the Stripe variables are set.
The Anthropic key is optional: intake falls back to the structured form and
the operator can price manually. `AI_MODEL` defaults to `claude-sonnet-5` and
can be pinned to another model available to the account.

Do not use `prisma db push`. Schema and database protections are versioned in
`prisma/migrations`.

### Existing databases created with `db push`

Back up the database first. If it was created from the pre-migration Prisma
schema, mark only the baseline as applied, then deploy the remaining
migrations. The idempotent `legacy_upgrade` bridge adds any columns, tables
and indexes missing from that older schema; it is a no-op on a fresh install.

```bash
npx prisma migrate resolve --applied 20260730000000_baseline
npm run db:migrate
```

Existing file rows intentionally remain blocked until they are inspected.
Open the task in the operator area and use **Recheck** beside each legacy file.

## Core guarantees

- Every protected read and mutation rechecks the session, role and resource
  ownership. Unverified email accounts cannot use protected areas.
- Client price and specialist payout are independent integer-cent values and
  are omitted from the other role's SQL projection.
- A non-internal task cannot enter the worker pool without a received payment.
  Stripe fulfillment uses signed webhooks and idempotent records.
- Task transitions are compare-and-swap operations written with their audit
  event. PostgreSQL triggers enforce payment, completion/payout and immutable
  completion-time invariants.
- Refunds and payouts are queued as money intents. Stripe refunds are processed
  by maintenance; manual payments, refunds and specialist payouts require an
  operator reference. Chargebacks and reversals are reconciled from Stripe.
- Uploaded files are limited to 25 MB and the reviewed extensions:
  CSV, XLSX, PDF, DOCX, PNG and JPEG. Signatures, archive expansion,
  dangerous formulas, macros, external Office relationships and known malware
  payloads are checked. Common Office/image metadata is removed.
- Production uploads fail closed unless ClamAV is reachable. Files cannot be
  attached or downloaded until their scan evidence is `clean`.
- Worker-facing filenames are generated and client-authored revision/dispute
  text is not shown directly to workers. The operator publishes an
  identity-safe instruction summary.
- Terminal task files are purged after the configured retention period. Blob
  deletion succeeds before the database is marked purged.
- The ledger is append-only in PostgreSQL, sequenced under an advisory lock and
  linked by a tamper-evident hash chain.

No automated scanner can reliably remove identifying information written into
visible document content. The product therefore still requires client
redaction and operator review; the public security page says this explicitly.

## Required production services

1. **PostgreSQL** — set pooled `DATABASE_URL` for the app and unpooled
   `DIRECT_URL` for migrations. Run `npm run db:migrate` during deployment.
2. **Persistent private storage** — mount `./storage` as a non-public volume,
   or replace `src/lib/storage.ts` with a private object-storage adapter.
3. **ClamAV** — set `CLAMAV_HOST` and optionally `CLAMAV_PORT`. Production
   scanning cannot be disabled.
4. **Stripe** — set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`; send these
   events to `POST /api/webhooks/stripe`:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`.
5. **Resend** — set `RESEND_API_KEY` and a verified `EMAIL_FROM`. Production
   verification and notification mail refuses to silently fall back.
6. **Scheduler** — call `POST /api/cron/maintenance` with
   `Authorization: Bearer $CRON_SECRET`. A five-minute interval is appropriate.
   It expires quotes/payments, removes orphan/retained files, processes money
   intents and drains the email outbox.
7. **Authentication origin** — set a strong `BETTER_AUTH_SECRET`,
   `BETTER_AUTH_URL`, `APP_URL` and `NEXT_PUBLIC_SITE_URL` to the HTTPS origin.

Optional Google login uses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

## Verification

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
npm audit
npx prisma migrate status
```

CI repeats those checks against PostgreSQL 16. The dependency overrides pin
patched PostCSS, Sharp and brace expansion releases. `patch-package` contains
the small CommonJS compatibility adapter needed by ESLint's older Minimatch.

## Deliberate V1 limits

- Specialist payouts are operator-recorded, not sent through an external
  payout API.
- The built-in storage adapter expects one persistent application volume; use
  object storage before horizontally scaling the web tier.
- Quality review and identity-content review are operator work. Capacity is
  therefore constrained by operator throughput.
- The legal pages are operational drafts. Insert the contracting entity,
  governing law, tax treatment and counsel-approved worker classification
  before public commercial launch.

The business model makes sense only while the operator can price, review and
resolve exceptions cheaply enough to preserve the spread between client price
and worker payout. Track review minutes, rework rate, refund/chargeback rate,
specialist effective hourly earnings and contribution margin per task before
scaling acquisition.
