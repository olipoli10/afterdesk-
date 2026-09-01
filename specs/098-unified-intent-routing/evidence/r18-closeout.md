# R18 Closeout — Unified Intent and Entity Resolution

## Result — CODE

R18 adds one strict, provider-neutral envelope for authenticated portal text,
local voice transcripts and selected-file observations. All three source kinds
reuse the existing deterministic Construction Operating Assistant interpreter.
The authenticated server session supplies actor identity; client payloads
cannot choose it.

Resolution preserves source kind, stable source ID, occurrence time, evidence
reference, verification state and a body hash. Selected project/contact context
is checked against the canonical workspace. Conflicting or cross-workspace
context fails closed.

`RESOLVE_ONLY` never performs a business transition. Portal text may request an
explicit validated transition directly; transcript and file sources require
`HUMAN_CONFIRMED`. Validated work is bridged into the existing R2 canonical
processor rather than creating another calendar, action or open-loop engine.

Stable envelope and source claims are immutable, globally collision-safe and
transactionally guarded. Exact sequential and concurrent replay reconstructs
one canonical effect. Changed-content, cross-workspace and context-conflict
reuse is refused. An exact reschedule replay remains reconstructible after the
calendar state has already changed.

## Observed gates — TEST

- R18 deterministic contract tests: 4/4 passed;
- R18 disposable-PostgreSQL tests: 4/4 passed;
- equal facts across portal text, confirmed voice transcript and confirmed file
  observation resolved to the same intent, project, contact and time;
- ambiguous time produced clarification with zero calendar, action or open-loop
  effect;
- an unverified transcript was refused with zero consequential effect;
- exact sequential replay and two concurrent copies produced one canonical
  effect;
- changed-content and cross-workspace stable-ID reuse were refused;
- exact reschedule replay reconstructed the original canonical interpretation
  after state change;
- R2/R9/R18 focused unit regressions: 13/13 passed;
- R2/R9/R18 disposable-PostgreSQL regressions: 9/9 passed;
- complete mobile suite: 37/37 passed across 9 files;
- root/mobile lint and typecheck: passed;
- local Next.js Webpack compile: 109/109 routes generated with synthetic local
  auth material and storage disabled; no migration or deployment;
- `git diff --check`: passed;
- Spec Kit Analyze: PASS — specification, plan, tasks and implementation are
  aligned; no contradictory requirement or unresolved placeholder remains;
- root and mobile lockfiles: unchanged.

## Mutation and refusal proof — TEST

- source channel changes while facts remain equal: same canonical resolution;
- ambiguous `mardi à 2`: exact clarification, no write;
- transcript verification removed: transition refused;
- stable source reused with altered body: `UnifiedIntentConflict`;
- stable source reused in another workspace: `UnifiedIntentConflict`;
- duplicate delivered concurrently: one applied result and one replay;
- replay after reschedule changed canonical state: original result reconstructed;
- unknown mobile keys or response-binding drift: strict parser refusal.

## Authority and limits — CODE

- local code, tests, disposable PostgreSQL and local Git only;
- no provider, customer data, live SMS/call/email/calendar, external transport
  or external write;
- no schema, migration, dependency or lockfile change;
- no push, Preview deployment, Production, EAS or store action;
- this is local build proof, not provider readiness, customer value, product-
  market fit or Verified-E2E coverage.
