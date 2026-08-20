# EF-001 — Controlled Bake-off Review

**Status:** `BAKE-OFF IN PROGRESS` — one focused case only. This review does
not adopt a model, provider, harness or coding workflow.

## Frozen inputs

- Candidate start commit: `651a41949c0461a7331e4c41395e9a4c2cd0add2`
- Candidate A (Codex): `787bb784701dd637bfce473c0720cb5c2684b7af`
- Candidate B (Claude): `188c2fc10f72d7c4cb7a857c2c3ba00e872dabfe`
- Frozen oracle: malformed `requiredAccessCount: -1` must produce an entirely
  human plan with the existing `required_access` reason.
- Permitted candidate source: `src/lib/ai-work-engine/compile.ts` only.

Both candidates have the same parent, leave the frozen test and challenge
unchanged, and modify only the permitted source file.

## Independent reviewer checks

| Gate | Candidate A — Codex | Candidate B — Claude |
| --- | --- | --- |
| Frozen parent | pass | pass |
| Seeded targeted test | 22/22 pass | 22/22 pass |
| Full test suite | 1,217/1,217 pass | 1,217/1,217 pass |
| TypeScript | pass | pass |
| Lint | 0 errors; 2 pre-existing warnings | 0 errors; 2 pre-existing warnings |
| Scope | one permitted source file | one permitted source file |
| Lockfile | unchanged | unchanged |
| Named mutation | caught and restored | caught and restored |
| Additional runtime oracles | pass | pass |

The additional runtime review exercised `-1`, `NaN`, `0.5`, positive
infinity and `0`. Both candidates make every non-zero or malformed value
human work and allow automation only when the value is zero.

## Diff comparison

- Candidate A uses `requiredAccessCount !== 0` and adds a two-line rationale
  (3 additions, 1 deletion).
- Candidate B names `accessCountProvenZero` and explicitly requires an integer
  equal to zero (9 additions, 1 deletion).

These implementations are observably equivalent for the seeded and hostile
runtime values reviewed. Candidate A is smaller. Candidate B makes the
integer proof more explicit. Neither difference creates a demonstrated
correctness, safety or performance advantage in EF-001.

## Decision

**Technical verdict for EF-001: tie.** Both candidates satisfy the frozen
oracle, scope, mutation and independent runtime checks. The scorecard cannot
rank cost or elapsed time because neither run supplied a supported measurement
source. Diff size is useful review context, but it is not a substitute for
measured accepted-result cost.

No primary coding model or provider decision may be inferred from this one
case. The next catalog family must remain an isolated candidate bake-off.

## Local-only statement

No push, Preview, Production action, provider call, database operation,
credential access, package installation or protected-worktree modification
occurred during this review.
