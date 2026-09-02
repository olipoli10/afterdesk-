# R24 Closeout — Provider-neutral SMS/MMS

## Result — CODE

R24 extends the existing R4 communication engine; it does not create a second
SMS engine. Trusted normalized SMS/MMS events now route to exactly one
authorized construction project or require clarification. Exact replay is
idempotent, ambiguous/cross-workspace input is refused, and selected MMS media
must already be admitted evidence for the same workspace and project.

Consent is purpose-specific (`service` or `commercial`). STOP atomically
withdraws and suppresses both purposes. START never grants consent; it leaves a
review-required state. Owner/admin policy changes and synthetic delivery
observations are immutable, versioned and replay-safe.

An approved R4 SMS can become a policy-bound `PREPARED_UNSENT` connector
operation only when its exact version and payload fingerprint still match and
the contact has active consent. The request retains hashes and an opaque contact
reference, not a raw phone number. No runtime consumer or provider dispatch was
added.

The shared Expo application now provides one Messages surface for both iOS and
Android. It exposes separate service/commercial permissions, exact approved SMS
inspection, local preparation, timeline, synthetic-proof labels and restart-safe
outbox recovery. The field-worker projection contains counts only and recursively
refuses contact, recipient, body, evidence and delivery details.

## Observed gates — TEST / SYNTHETIC

- R24 contract/policy unit tests: 6/6 passed;
- combined R4/R10/R11/R24 unit regressions: 17/17 passed across four files;
- R24 disposable-PostgreSQL scenarios: 4/4 passed;
- combined R4/R10/R11/R12/R14/R24 PostgreSQL regressions: 14/14 passed across
  six serialized files;
- R24 native messaging contracts, role guards and restart-safe outbox: 5/5
  passed;
- full native suite: 62/62 passed across 15 files;
- Expo doctor: 21/21 checks passed;
- local Expo export: iOS, Android and Web succeeded, including the Messages
  route and 37 static routes;
- root and mobile lint and typecheck: passed;
- Prisma formatting, validation and client generation: passed;
- all 51 forward-only migrations were applied from the complete chain in the
  isolated R24 PostgreSQL store; the local application database reports 51/51
  and current;
- local Next.js Webpack build: 109/109 pages generated, including
  `/api/endvera/v1/mobile/communications`;
- `git diff --check`: passed;
- root lockfile blob `4751025f16f2237d3d63eecb6c28d26526712c7e`
  and mobile lockfile blob `cc36b40fcf77d0bf71fd8b3b5a3fab10fcaeec98`
  remain byte-identical to the R24 base.

## Fail-closed observations — TEST

- an integration command without `AFTERDESK_TEST_DATABASE_URL` was refused
  before any reset or write;
- an Expo export without an explicit production-safe API origin was refused by
  `MOBILE_API_URL_REQUIRED`; the successful local export used only
  `https://local.invalid`;
- Webpack collection without local synthetic auth/storage configuration was
  refused by the existing secret and durable-storage guards; the successful
  build used ephemeral build-only values and performed no provider call.

## Authority and limits — CODE

- local code, tests, disposable PostgreSQL, local native export and local Git
  only;
- no customer/prospect data, real phone, provider, webhook, OAuth, credential,
  SMS, MMS, email, voice call, external transport or external write;
- synthetic delivery state is labeled `SYNTHETIC_LOCAL` and does not prove a
  provider delivery;
- no dependency or lockfile change;
- two forward-only migrations: additive messaging tables followed by an exact
  widening of the existing connector-operation kind constraint;
- no `prisma db push`, push, Preview, Production, EAS, deployment or store
  action;
- provider/customer test readiness and Verified-E2E remain unproven.
