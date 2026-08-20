# EF-006 — Controlled Bake-off Review

**Status:** `BAKE-OFF IN PROGRESS` — one focused local case only. This review
does not adopt a model, provider, gateway or coding workflow.

## Frozen inputs

- Factory base before seed creation: `95c0a5b5fa4631e689f3b147a014220e24d99419`
- Candidate execution start: `949d78172e6d5a747ed09096afec04dea97db7a7`
  (the repaired frozen seed; it fixes only the seed test's invalid zero-argument
  constructor call after the original seed commit).
- Candidate A branch: `devbench/ef006-codex-r2`
- Candidate A final commit: `3852a09359244e4dc89f61bf7e39d3f2fe5caf8f`
- Candidate B branch: `devbench/ef006-claude-r2`
- Candidate B final commit: `5b901a6e209ce4dc1c87e01b32802e044f152950`
- Challenge: `docs/engineering-factory/EF-006-FROZEN-CHALLENGE.md` in the
  frozen candidate seed.
- Scope: `test/support/provider-replay.ts` only in both completed candidates.

The originally-created EF-006 candidate folders based on `2004d41` are
excluded. Their seed test did not typecheck because it called a zero-argument
synthetic constructor with an argument. Neither reviewed candidate derives from
that invalid seed.

## Independent reviewer checks

| Gate | Candidate A — Codex | Candidate B — Claude |
| --- | --- | --- |
| Candidate parent is repaired frozen seed | pass | pass |
| Allowed-file scope / lockfile / fixture residue | one allowed source file / clean / none | one allowed source file / clean / none |
| Seeded target test | 40/40 pass | 40/40 pass |
| TypeScript | pass | pass |
| Lint | 0 errors; 2 pre-existing warnings | 0 errors; 2 pre-existing warnings |
| Full suite | 58 files / 1217 tests pass | 58 files / 1217 tests pass |
| `git diff --check` | pass | pass |
| Named mutation evidence | reported: `synthetic-response-invention`, caught and byte-restored | reported: `synthetic-response-invention`, caught and byte-restored |
| Rejects non-object, null, and non-array content before accounting | pass | pass |
| Valid synthetic worlds preserve provider wire shape | pass | pass |
| Invalid synthetic response increments no synthetic counter | pass | pass |

Both candidates add their validation immediately after the existing missing-
responder rejection and immediately before `stats.synthetic += 1`. Therefore a
malformed responder result cannot reserve budget, write a fixture, replay, or
fall through to a real provider via this boundary.

Candidate A extracts the minimal structural check into a named type guard,
`isSyntheticProviderResponse`. Candidate B inlines the same object-and-content-
array predicate inside the call path and adds a substantially longer local
comment and error message. Neither implementation changes routing, fixtures,
credentials, network behavior or valid message construction.

## Decision

**Technical winner for EF-006: Candidate A (Codex), narrowly.** The behavioral
result is equivalent under the frozen oracle. Candidate A expresses the provider
message boundary once as a typed predicate, keeps the admission path concise,
and leaves an obvious reusable point if a second synthetic entrypoint is added.
Candidate B is correct, but its inline explanation is longer than the narrow
guard requires and does not add a distinct fail-closed property.

This remains deliberately limited:

- no supported elapsed-time or cost meter was supplied for either candidate;
- one local synthetic-boundary case cannot establish general coding quality,
  provider quality, gateway readiness or operational reliability;
- the winning commit remains a local candidate, not an adopted product change.

## Local-only statement

No push, Preview, Production action, provider call, database operation,
credential access or product-worktree modification occurred during this review.
