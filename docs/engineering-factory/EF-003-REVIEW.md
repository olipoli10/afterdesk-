# EF-003 — Controlled Bake-off Review

**Status:** `BAKE-OFF IN PROGRESS` — one focused case only; no model, provider
or workflow is adopted by this review.

## Frozen inputs

- Candidate start commit: `b0e9d4355baf36b7d088f4f1149a634434b7ef73`
- Candidate A branch: `devbench/ef003-codex`
- Candidate B branch: `devbench/ef003-claude`
- Challenge: `docs/engineering-factory/challenges/EF-003-NAT64-SSRF.md`
- Scope: `src/lib/net/url-safety.ts` only in both completed candidates.

The challenge document carries an older seed SHA in one sentence
(`34954c2`). The actual, identical candidate starting commit above is the
authority for this review. This is a documentation defect in the benchmark
setup, not a candidate defect.

## Independent reviewer checks

| Gate | Candidate A — Codex | Candidate B — Claude |
| --- | --- | --- |
| Seeded RED observed | reported and independently reproducible | reported and independently reproducible |
| Seeded target test | 49/49 pass | 49/49 pass |
| TypeScript | pass | pass |
| Scope / diff check | one allowed source file / pass | one allowed source file / pass |
| Named mutation | reported caught and byte-restored | reported caught and byte-restored |
| Direct NAT64 hex literal | pass | pass |
| Expanded NAT64 hex literal in `isBlockedAddress` | **fail** | pass |
| Network / secrets / DB / deploy | none reported | none reported |

The additional oracle tested the equivalent literal
`64:ff9b:0:0:0:0:a9fe:a9fe` directly against the pure address predicate.
Candidate A returns `false`; Candidate B unwraps it to `169.254.169.254` and
blocks it. A URL parser may normalize this spelling before classification, but
the pure predicate is documented as the guard a future address-pinned fetch
applies to every resolved address. The expanded spelling therefore matters.

## Decision

**Technical winner for EF-003: Candidate B (Claude).** It addresses the
address structure rather than only the exact compressed text in the seeded
test. Candidate A is shorter and reported a lower elapsed time, but leaves an
equivalent direct-address spelling unprotected.

This is deliberately not a cost winner and not an adoption decision:

- both reported `cost unavailable`, so neither result is formally comparable
  by the current measured-cost scorecard;
- elapsed time was estimated rather than harness-instrumented;
- one focused security case cannot establish general coding quality,
  operational reliability or a provider/tool decision.

## Follow-up before any adoption decision

1. Add the expanded NAT64 spelling as a permanent oracle in a future focused
   case or the catalog's EF-003 strengthening pass; do not rewrite this frozen
   run after the fact.
2. Instrument elapsed time and measured cost at the harness boundary.
3. Run additional independent catalog families before selecting a primary
   coding workflow.

## Local-only statement

No push, Preview, Production action, provider call, database operation,
credential access or product-worktree modification occurred during the
review.
