# R25 Closeout — Permissioned voice calls and voice notes

## Result — CODE

R25 extends the existing R4 trusted voice envelope and R18 intent router. It
does not add a second assistant, transcript store or provider-specific call
engine. A trusted normalized inbound transcript is bound to one verified opaque
voice identity, one workspace and at most one active project. Exact replay is
idempotent; ambiguity and unverified synthetic transcripts cannot create a
consequential project fact.

Call disclosure, recording consent, transcription consent and transcript proof
level are explicit. Selected foreground M4A notes pass the shared signature and
scanner boundary, retain only an opaque storage reference and remain
`TRANSCRIPTION_PREPARED`; no transcript or intent is invented. Immutable call
transitions and replay hashes are retained in PostgreSQL.

Owners and office users can prepare an exact internal or service call work item
for a verified contact. Commercial automated calling is refused. The work
remains `PREPARED_UNSENT` with a disclosure script, result schema and human next
owner. No dialer, provider adapter, speech synthesis, public webhook, consumer
or external transport was added.

The shared Expo application adds one Calls & voice surface for iOS and Android.
Recording is explicit, foreground-only, capped at 120 seconds and cancelled on
backgrounding. The mobile outbox can recover prepared call commands; selected
device audio paths are not persisted for automatic upload. Field workers see
only their own minimized note metadata.

## Observed gates — TEST / SYNTHETIC

- R25 plus relevant R4/R18/R22 unit regressions: 19/19 passed across five files;
- R25 plus relevant R4/R18/R22 disposable-PostgreSQL regressions: 16/16 passed
  across four serialized files;
- full root unit suite: 1,915/1,915 passed, with two explicitly skipped tests;
- full shared mobile suite: 67/67 passed across 16 files;
- root and mobile typecheck: passed;
- root and mobile lint: passed;
- Expo Doctor: 21/21 checks passed;
- local Expo export: iOS, Android and Web succeeded with the Calls route and 39
  static routes;
- Prisma formatting, validation and client generation: passed;
- all 52 forward-only migrations applied to a fresh isolated PostgreSQL store;
  `prisma migrate status` reported 52/52 current;
- Next.js Webpack build: 109/109 pages generated, including both R25 mobile API
  routes;
- Spec Kit analysis: 15 functional requirements, 17 tasks, 100% requirement
  coverage, zero critical constitution conflict, zero ambiguity and zero
  duplication finding;
- `git diff --check`: passed;
- root lockfile remained byte-identical at
  `4751025f16f2237d3d63eecb6c28d26526712c7e`;
- mobile lockfile changed intentionally from
  `cc36b40fcf77d0bf71fd8b3b5a3fab10fcaeec98` to
  `64e3461e6ecbafad6a05ba27b1aba26be8238d98` only for Expo-compatible
  `expo-audio` and its required `expo-asset` peer;
- production-dependency audit reported zero critical, zero high and 14 moderate
  Expo-SDK transitive advisories whose automated suggestions require unrelated
  major downgrades; no unsafe automatic audit rewrite was applied.

## Fail-closed observations — TEST

- the first immutable-transition check correctly exposed that a previously
  applied disposable migration did not contain the latest trigger; rebuilding
  the R25 store from all 52 migration files made the direct update fail and the
  full integration set pass;
- Expo Doctor refused the first package graph because `expo-audio` required the
  native `expo-asset` peer; installation through the Expo-compatible installer
  produced a 21/21 pass and successful all-platform export;
- the full root suite exposed a previously unreviewed same-origin R16 browser
  fetch. The global allowlist now records the exact fixed first-party path and
  continues to refuse user-, model- or connector-controlled destinations;
- Webpack collection without synthetic durable-storage configuration was
  refused by the existing production guard. The successful local build used
  ephemeral build-only values and made no provider request.

## Authority and limits — CODE

- local code, tests, disposable PostgreSQL, local native export and local Git
  only;
- no customer/prospect data, real phone, provider credential, provider call,
  recording provider, public webhook, OAuth, synthesized voice, SMS, email,
  external transport or external write;
- synthetic and human-transcribed fixtures are development evidence, not
  provider-observed calls;
- no `prisma db push`, push, Preview, Production, deployment, EAS or store
  action;
- provider/customer test readiness and Verified-E2E remain unproven.
