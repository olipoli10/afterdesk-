# EF-005 — Controlled Bake-off Review

**Status:** `BAKE-OFF IN PROGRESS` — one focused local case only. This review
does not adopt a model, provider, gateway or coding workflow.

## Frozen inputs

- Candidate start commit: `715ed11b83512e6ef819d2c36be0de5940dbeb41`
- Candidate A branch: `devbench/ef005-codex`
- Candidate A final commit: `6b50f31a8550d0c83121e2a8e98102775e1537bd`
- Candidate B branch: `devbench/ef005-claude`
- Candidate B final commit: `aee842983a1770c1e32df338d4761aceb55d178b`
- Challenge: `docs/engineering-factory/EF-005-FROZEN-CHALLENGE.md` in the
  frozen candidate seed.
- Scope: `test/support/provider-replay.ts` only in both completed candidates.

## Independent reviewer checks

| Gate | Candidate A — Codex | Candidate B — Claude |
| --- | --- | --- |
| Frozen start parent | pass | pass |
| Seeded RED observed | reported; independently reproduced | reported; independently reproduced |
| Seeded target test | 23/23 pass | 23/23 pass |
| TypeScript | pass | pass |
| Lint | 0 errors; 2 pre-existing warnings | 0 errors; 2 pre-existing warnings |
| Full suite reported | 58 files / 1217 tests pass | 58 files / 1217 tests pass |
| Scope / lockfile / fixture residue | one allowed source file / clean / none | one allowed source file / clean / none |
| Named mutation | `fixture-hash-ignored` caught and byte-restored | `fixture-hash-ignored` caught and byte-restored |
| Full tool definition changes the request key | pass | pass |
| Stored request bytes are re-fingerprinted before replay | pass | pass |
| Malformed on-disk `tools` value can alias a no-tools request | **fails** | pass |

Both candidates correctly replace the former `type:name` reduction with the
full tool definition and reject the seeded message-body tamper. The final
row is an additional static reviewer check on the same untrusted fixture
boundary: a JSON fixture is not type-safe merely because TypeScript declares
`tools` as an array.

Candidate A reconstructs through `fixtureKey()`, which is appropriately
single-sourced, but its `Array.isArray(params.tools) ? params.tools : []`
normalization makes a stored non-array `tools` value indistinguishable from an
empty array. A malicious fixture that kept the valid no-tools address could
therefore pass provenance after changing its stored `tools` to a malformed
JSON value.

Candidate B fingerprints the stored value verbatim during provenance
verification. That means the malformed value produces a different canonical
request and is rejected rather than normalized into a valid identity. Its
reconstruction is more verbose and duplicates the canonical request shape,
which is a maintenance cost, but it is the stronger fail-closed behavior for
the narrow untrusted-artifact problem EF-005 defines.

## Decision

**Technical winner for EF-005: Candidate B (Claude).** Both candidates pass
the frozen oracle and their required mutation, but Candidate B preserves a
malformed stored tools value for the identity check instead of silently
equating it with `[]`. For replay provenance, false acceptance is materially
worse than a false miss.

This is deliberately not a speed, cost or adoption decision:

- no supported elapsed-time or cost meter was supplied for either candidate;
- one local fixture-provenance case cannot establish general coding quality,
  provider quality, gateway readiness or operational reliability;
- the winning commit remains a local candidate, not an adopted product change.

## Local-only statement

No push, Preview, Production action, provider call, database operation,
credential access or product-worktree modification occurred during this
review.
