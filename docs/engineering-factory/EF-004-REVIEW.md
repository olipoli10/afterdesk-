# EF-004 — Controlled Bake-off Review

**Status:** `BAKE-OFF IN PROGRESS` — one focused local case only. This review
does not adopt a model, provider, harness or coding workflow.

## Frozen inputs

- Candidate start commit: `7e2571ae463a28f6adb28f977211b0606a7ddfed`
- Candidate A (Codex): `6aa5002ec8a6861fee6601301872c7c42b056b14`
- Candidate B (Claude): `49cfffcfbe54f31fc50871300bb29f12752aaf45`
- Frozen oracle: a `use client` component must not import runtime values from
  a module marked `server-only`; type-only imports remain permitted.
- Permitted candidate source:
  `src/lib/ai-work-engine/primitive-vocabulary.ts` only.

## Independent reviewer checks

| Gate | Candidate A — Codex | Candidate B — Claude |
| --- | --- | --- |
| Frozen parent | pass | pass |
| Seeded RED | reproduced | reproduced |
| Seeded targeted test | 2/2 pass | 2/2 pass |
| Full test suite | 1,216/1,216 pass | 1,216/1,216 pass |
| TypeScript | pass | pass |
| Lint | 0 errors; 2 pre-existing warnings | 0 errors; 2 pre-existing warnings |
| Scope / diff check | one permitted source file / pass | one permitted source file / pass |
| Lockfile | unchanged | unchanged |
| Named mutation | caught and byte-restored | caught and byte-restored |

## Diff comparison

Both candidates remove exactly the two seeded lines:

```ts
import "server-only";

```

Their final Git tree IDs are identical:

`70fccd2d7dddec9f4ca93029456b4cc475f46b6e`

The resulting source blob for the permitted file is also identical:

`ab306d30264b47d6c636398a29d31569fad6c318`

## Decision

**Technical verdict for EF-004: exact tie.** Both candidates are the same
final source state, with the same proof and scope. No measured elapsed or cost
evidence exists, so no timing or cost ranking is available.

This narrow result is not a general coding-model decision and does not adopt a
provider or workflow. A winner remains only a candidate until broader,
independently reviewed evidence exists.

## Local-only statement

No push, Preview, Production action, provider call, database operation,
credential access, package installation or product-worktree modification
occurred during the review.
