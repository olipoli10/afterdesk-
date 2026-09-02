# R23 Closeout — Permissioned Calendar Connector Foundation

## Result — CODE

R23 extends the canonical connector account, grant and immutable operation
tables to support Google Calendar and Microsoft Outlook Calendar independently.
Owners and office users can prepare least-privilege read-only or read/write
authority, inspect the exact requested/granted scopes, and revoke one provider
without changing the other. Field-worker projection remains empty.

The provider adapters prepare deterministic read, create and update envelopes.
They bind writes to the canonical construction calendar fingerprint, require a
remote precondition for updates, suppress attendee notifications, classify
cursor/auth/conflict/throttle failures and refuse execution. OAuth, credentials,
provider traffic, background consumers and external writes remain disabled.

The shared iOS/Android code now contains one Connexions calendrier cockpit,
strict native schemas, the protected mobile API and a restart-safe outbox for
prepare/revoke commands. A mobile retry keeps the exact command identity and
never dispatches automatically.

## Observed gates — TEST / SYNTHETIC

- R23 unit contracts and provider adapters: 5/5 passed;
- R23 disposable-PostgreSQL scenarios: 4/4 passed;
- R23 native mobile contracts and restart-safe outbox: 4/4 passed;
- relevant R3/R16 unit regressions: 9/9 passed;
- combined R3/R13/R16/R23 PostgreSQL regressions: 14/14 passed;
- full native mobile suite: 57/57 passed across 14 files;
- root and mobile lint and typecheck: passed;
- Prisma formatting, validation and client generation: passed;
- all 49 forward-only migrations applied from empty state in the disposable
  PostgreSQL database and migration status is current;
- local Next.js Webpack build: 109/109 pages generated, including
  `/api/endvera/v1/mobile/calendar-connectors`;
- `git diff --check`: passed;
- root and mobile lockfile hashes remain byte-identical to the frozen baseline.

## Regression caught and corrected — TEST

The first combined R16 regression run proved that the draft provider check
constraint had replaced the existing SMS/voice values while adding Microsoft.
The uncommitted R23 migration was corrected to widen the historical set rather
than replace it. A full disposable reset and the complete combined PostgreSQL
gate then passed 14/14, including the SMS permission-center scenarios.

## Authority and limits — CODE

- local code, tests, disposable PostgreSQL and local Git only;
- no provider, OAuth, credential, customer data, live calendar, SMS, call,
  email, accounting/payment rail, external transport or external write;
- no dependency or lockfile change;
- one forward-only additive provider-constraint migration, with no destructive
  application-data change and no `prisma db push`;
- no push, Preview, Production, EAS, deployment or store action;
- this proves local deterministic preparation, persistence, revocation and
  mobile projection only. Provider execution and Verified-E2E remain unproven.
