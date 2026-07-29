# Nightlexicon

Two-sided platform for outsourced administrative work. Clients submit tasks; VAs
(Philippines) execute them; a single operator/admin sits between the two sides
and is the only channel between them.

## Run it locally

```bash
# 1. Start the local Postgres (leave it running in its own terminal)
npx prisma dev

# 2. First time only: create the schema and the admin account
npm run db:push
npm run db:seed

# 3. Start the app
npm run dev          # http://localhost:3000
```

Accounts: the admin is seeded from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`
(there is no public admin signup). Clients register at `/register`, VAs at
`/register/va`.

> **Windows note:** if Prisma cannot reach the database, the connection string
> must use `127.0.0.1`, not `localhost` — Node resolves `localhost` to IPv6
> while the dev server listens on IPv4 only.

## What is built (spec steps 1–3)

1. **Auth + three roles.** Better Auth (email + password). `role` is
   `input: false` — it can only ever be set server-side, so a signup request
   cannot smuggle `role: "ADMIN"`. Each area (`/client`, `/va`, `/admin`) is
   gated in its layout and re-checked in every server action.
2. **Client task submission.** Free-text description plus title, quantity,
   deadline (entered in the client's local timezone) and file uploads
   (200 MB/file, 20 files, csv/xlsx/xls/pdf/docx/png/jpg/zip).
3. **Admin pricing queue.** Urgency-sorted queue, task detail with the client's
   files, the two independent prices, priority tier, approve-and-advance
   (`Ctrl+Enter`), and cancel-with-reason.

Not built yet: AI price suggestion (4), VA pool + claim (5), deliverables + QC
(6), entry test (7), notifications (8), score + payouts (9).

## The two hard rules, and where they live in code

**RULE 2 — `client_price` and `va_payout` are independent and role-isolated.**
Enforced at the data layer, not the UI: every read goes through a role-shaped
`select` in `src/lib/queries/tasks.ts`. `clientTaskSelect` does not list
`vaPayoutCents`; the VA selects will not list `clientPriceCents`. The forbidden
column is absent from the SQL projection, so it cannot reach a payload even if
a component tries to render it. Corollaries kept in place deliberately:

- `transitionTask` returns `{ id, status }`, never a full `Task` row.
- Prices are **not** written into `TaskEvent.meta` (that table has no
  role-shaping); the audit log records `{ tier, priced: true }`.
- `taskEventsForAdmin` is named for its only safe audience.

**RULE 1 — client and VA never learn each other's identity.** No messaging
exists anywhere. Filenames are anonymized in both directions
(`src/app/api/files/[id]/download/route.ts`): a VA sees
`task-abc123-input-9f2.csv`, never `AcmeCorp_CRM_export.csv`; a client sees
`task-abc123-deliverable.xlsx`, never the VA's filename. The pricing step is a
mandatory content gate — the operator must attest they reviewed the
description, quantity and files for identifying details before a task can be
quoted.

## Conventions worth keeping

- **All money is integer cents** (`src/lib/money.ts`), with a `currency` column.
- **All timestamps are UTC in the database**, rendered in the viewer's timezone
  with a visible timezone label (`src/components/local-time.tsx`). Never render
  a bare time.
- **Two deadlines per task.** `clientDeadlineUtc` is when the client receives
  approved work; `vaDeadlineUtc` is that minus the QC buffer (default 3 h). A VA
  must never see the client-facing deadline.
- **Status changes go through `transitionTask` only** (`src/lib/state.ts`). It
  validates the pair against `ALLOWED_TRANSITIONS`, performs a compare-and-swap
  (so concurrent actors cannot corrupt state), and writes the audit event in the
  same transaction. This is also the claim-race mechanism for step 5.
- **No `prisma.*` calls outside `src/lib` and `src/server`** — a grep-able rule
  that keeps the role-shaped selects the only path to task data.
- **Operational values are settings, not constants** (`src/lib/settings.ts`):
  working hours, QC buffer, thresholds, windows, retention, and the AI pricing
  prompt. Defaults live in code; a `Setting` row overrides any of them without a
  redeploy.
- **Sweeps instead of a worker** (`src/server/sweeps.ts`): quote expiry and
  orphan-file cleanup run when the operator opens their queue. A one-person
  product does not need a scheduler yet.

## Deployment (when ready)

Vercel **Pro** (the Hobby plan forbids commercial use), Neon Postgres, and
Cloudflare R2 with presigned URLs replacing the local-disk storage driver
(`src/lib/storage.ts` is already the seam). Vercel caps direct uploads at
~4.5 MB, so presigned R2 uploads are required for the 200 MB limit.
