# EF-007 — Controlled Bake-off Review

**Status:** `BAKE-OFF IN PROGRESS` — one focused local case only. This review
does not adopt a model, provider, gateway or coding workflow.

## Frozen inputs

- Factory base before seed creation: `a24b88167f7c04bf8ec2a0675fadd4af3af6738e`
- Candidate execution start: `eb85b209b1b1e76693b0bc512bb7eb8e95ed833f`
- Candidate A branch: `devbench/ef007-codex`
- Candidate A final commit: `bd59bb470c2b794df93af596672f2759021e3b81`
- Candidate B branch: `devbench/ef007-claude`
- Candidate B final commit: `273189aef23c4a3d1746421eebc4b8283d669d4f`
- Challenge: `docs/engineering-factory/EF-007-FROZEN-CHALLENGE.md` in the
  frozen candidate seed.
- Scope: `src/server/account-spend.ts` only in both completed candidates.

## Independent reviewer checks

| Gate | Candidate A — Codex | Candidate B — Claude |
| --- | --- | --- |
| Candidate parent is the frozen seed | pass | pass |
| Allowed-file scope / lockfile / worktree | one allowed source file / unchanged / clean | one allowed source file / unchanged / clean |
| Seeded target test | 42/42 pass | 42/42 pass |
| TypeScript | pass | pass |
| Lint | 0 errors; 2 pre-existing warnings | 0 errors; 2 pre-existing warnings |
| Full suite | 58 files / 1219 tests pass | 58 files / 1219 tests pass |
| `git diff --check` | pass | pass |
| Named mutation evidence | reported: `provider-dispatch-before-reservation`, caught and byte-restored | reported: `provider-dispatch-before-reservation`, caught and byte-restored |
| Rejects held-row amount drift before aggregate/create | pass | pass |
| Rejects held-row UTC-period drift before aggregate/create | pass | pass |
| Preserves exact held-row replay idempotency | pass | pass |
| Conflict message omits amount, ceiling, provider and period | pass | pass |

Both candidates compare the existing hold's `amountMicros` and `periodKey`
before returning an idempotent grant. A mismatch throws a dedicated conflict
error before the aggregate and create paths. Neither implementation changes the
advisory lock, ceiling calculation, valid replay result or new-hold path.

Candidate A adds a minimal conflict error with a fixed message and a single
guard at the reuse boundary. Candidate B implements the same guard but adds a
large explanatory block and stores `operationKey` and `attempt` as public
fields on the error object. Those fields do not appear in `.message`, so the
frozen message oracle passes; however, they add task/run-correlated identifiers
to an object that generic error logging or serialization may inspect. The
challenge does not require those identifiers, and neither seeded behavior nor
the mutation proof receives an additional invariant from them.

## Decision

**Technical winner for EF-007: Candidate A (Codex), narrowly.** Both candidates
are behaviorally correct under the frozen oracle. Candidate A closes the same
authorization gap with a smaller data surface and without attaching operation
identity to the thrown error. Candidate B's extra diagnostics and comments are
defensible for local debugging, but they add maintenance and potential logging
exposure without improving the required fail-closed property.

This remains deliberately limited:

- no supported elapsed-time or cost meter was supplied for either candidate;
- one reservation-identity case cannot establish general coding quality,
  provider quality, gateway readiness or operational reliability;
- the winning commit remains a local candidate, not an adopted product change.

## Local-only statement

No candidate was merged. No push, Preview, Production action, provider call,
database operation, credential access or protected product-worktree
modification occurred during this review.
