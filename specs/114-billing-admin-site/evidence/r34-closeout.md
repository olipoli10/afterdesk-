# R34 Commercial Account, Operator and Public Site Alignment — closeout evidence

Recorded at: 2026-09-02T09:26:27-04:00

## Result

R34 adds one Construction-specific commercial control plane without activating
billing. One closed, versioned Early Access plan records its exact feature and
usage catalogs, explicitly reports `PRICE_NOT_SET`, and keeps the billing
provider `DISABLED_LOCAL`. Owners and office managers can inspect plan state,
canonical informational usage and human-support state. Field workers cannot
serialize the commercial projection.

An ADMIN can assign the local plan or change its state through one exact,
version-bound command. The account and immutable decision are committed in one
serializable transaction. Identical replay has one effect; altered replay,
stale version, invalid transition, unknown plan, field access and cross-
workspace access fail closed.

The client Account and Human Support surfaces, Construction operator portfolio
and support queue, and public bilingual `/construction` page all use the same
closed capability/status vocabulary. The public page says what the local build
can do and explicitly does not claim price, payment, customer proof, product-
market fit, live providers or store availability.

## PostgreSQL and commercial proof

- R34 unit/claim gate: 1 file, 9 tests passed.
- R34 disposable PostgreSQL gate: 1 file, 6 tests passed.
- R21/R22/R28/R30-R34 targeted unit regression: 8 files, 48 tests passed.
- R21/R22/R28/R30-R34 targeted PostgreSQL regression: 8 files, 35 tests passed.
- Fresh disposable database applied all 59 forward-only migrations.
- Prisma schema validation and client generation passed.
- Concurrent identical assignment produced one account and one immutable
  decision; exact replay survived disconnect/reconnect.
- Seven usage readings matched canonical PostgreSQL state and period events.
- Missing-plan accounts sort ahead of healthy accounts without a read-side
  write.
- Owner/office access passed; field and cross-workspace access were refused.

## Product and presentation proof

- Client Account shows plan, unavailable price, seven usage readings, disabled
  capabilities and support state.
- Operator commercial and support surfaces expose a deterministic attention
  reason and one safe local next action.
- Public `fr-CA` and `en-CA` catalogs contain the same six canonical product
  capabilities and the same honest stage boundaries.
- Private APIs derive actor identity from the session, rate-limit requests and
  return private/no-store responses.
- Surfaces use semantic headings, labelled controls, visible focus, non-colour
  status text, wrapping actions and narrow responsive layouts.

## Final validation

- Root full unit suite: 136 files passed, 2 skipped; 1,968 tests passed, 2
  skipped.
- Shared iOS/Android unit suite: 24 files, 94 tests passed.
- Root and mobile lint: passed.
- Root and mobile TypeScript: passed.
- Next.js 16 Webpack build: passed; 110/110 static pages generated, including
  `/construction`, `/client/account`, `/client/support`,
  `/admin/construction-commercial`, `/admin/construction-support` and both
  private commercial APIs.
- Spec Kit Analyze: PASS; 6 user stories, 30 functional requirements, 12
  success criteria and 25 tasks, with zero critical or high finding.
- `git diff --check`: passed with line-ending notices only.
- Root and mobile lockfiles are unchanged; no dependency was added.

The first local build attempt correctly failed closed because `VERCEL_ENV` was
unset. The passing build used `development` plus process-local synthetic
compile-time values only. No value was written to the repository and no
external request was made.

## External-effect and dashboard boundary

R34 reports `providerObserved: false` and `externalEffectCount: 0`. It adds no
provider client, credential, card, payment, subscription, external transport,
external write, customer data, push, Preview, Production, deployment or store
action.

- strict canonical roadmap phase exits: 22%, unchanged;
- local AI engine build readiness: 46.75%, displayed 47%, unchanged;
- C2 preparation: 18/18 or 100%, unchanged;
- real provider/customer test readiness: `NO-GO`;
- Verified-E2E observed coverage: 0%.

R34 evidence remains `CODE + TEST + SYNTHETIC + DISPOSABLE POSTGRESQL`. It
prepares commercial account and release surfaces; it does not prove pricing,
willingness to pay, billing, customer value, provider behaviour, deployment,
Production or Verified-E2E coverage.
