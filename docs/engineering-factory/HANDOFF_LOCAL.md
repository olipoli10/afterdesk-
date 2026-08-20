# Engineering Factory / DevBench v1 — local handoff

## What changed

- Added a vendor-neutral catalog of eight representative, locally verifiable
  engineering task families.
- Added a fail-closed catalog validator and `npm run devbench:validate`.
- Added a fail-closed `DevBenchRun` evidence envelope that makes cost,
  mutation, command and reviewer evidence mandatory while rejecting sensitive
  field names by construction.
- Added an equal-packet protocol and lexicographic scorecard: a candidate with
  any safety/scope/mutation/reviewer failure is non-comparable, regardless of
  speed or cost.
- Added six tests, including four named in-memory mutations:
  `catalog-duplicate-id`, `catalog-destructive-command`,
  `catalog-missing-source-evidence`, and `catalog-provider-exposure`.
- Added the operating rule that the catalog never stores prompts, model output,
  credentials, client data or a provider decision.
- Hardened the run evidence envelope with explicit elapsed and cost measurement
  sources. A value is comparable only when it has a supported source; an
  honest `unavailable` source requires a null value and blocks only the
  affected ranking dimension.
- Added a permanent expanded NAT64 oracle so the pure URL-safety predicate
  rejects `64:ff9b:0:0:0:0:a9fe:a9fe`, not only its compressed spelling.
- Preserved EF-003 as frozen historical evidence: Claude's candidate remains
  the technical winner for that one case, but no result is a measured-cost or
  provider-adoption decision.
- Completed the focused EF-001 review from one frozen seed. Codex and Claude
  both passed the same oracle, mutation and hostile runtime values; the
  technical verdict is a tie and no cost or speed rank exists.
- Completed EF-002 from a frozen generated-capability-contract seed. Both
  candidates isolated the mutable published schema snapshots; Codex is the
  technical winner for the narrow case because it reuses the repository's
  existing `structuredClone` pattern rather than adding a bespoke recursive
  JSON clone. Neither run has measured cost or elapsed evidence.
- Completed EF-004 from a frozen client/server-boundary seed. Codex and Claude
  produced the exact same two-line source deletion, final Git tree and source
  blob; the technical verdict is an exact tie, with no measured cost or
  elapsed rank.
- Completed EF-005 from a frozen replay-fixture-provenance seed. Both
  candidates fingerprinted complete tool definitions and rejected altered
  stored request bytes. Claude is the narrow technical winner because it also
  rejects a malformed on-disk tools value instead of normalizing it to an
  empty tool list. No cost or elapsed ranking exists.
- Completed EF-006 from the repaired frozen synthetic-provider seed. Both
  candidates reject malformed synthetic responder output before accounting and
  preserve valid provider wire shapes. Codex is the narrow technical winner:
  the named typed response-shape guard is equivalent under the frozen oracle
  while remaining smaller and reusable. The original invalid-seed candidates
  are excluded from the comparison. No cost or elapsed ranking exists.
- Completed EF-007 from a frozen account-spend reservation-identity seed. Both
  candidates reject amount or UTC-period drift before any aggregate or new hold
  while preserving exact replay idempotency. Codex is the narrow technical
  winner because it closes the same authorization gap without adding
  task/run-correlated identifiers to the conflict error object. No candidate
  was merged or adopted, and no cost or elapsed ranking exists.
- Completed EF-008 from a frozen final-suffix file-admission seed. Both
  candidates reject compound or mismatched suffixes before reading file bytes
  and preserve valid bounded ingestion. Claude is the narrow technical winner
  because a typed primitive-to-suffix table prevents a future caller from
  compiling an inverted CSV/XLSX pairing. Its comments are more verbose than
  the narrow change requires. No candidate was merged or adopted, and no cost
  or elapsed ranking exists.
- Closed DevBench v1 after reconciling all eight reviews and freshly replaying
  the full suite on all 16 admissible candidate commits. The technical record
  is Codex 3 wins, Claude 3 wins and 2 ties. This is explicitly a no-adoption
  result because exact stable configurations, intervention counts and
  supported cost/time measurements were not persisted.
- Added the local measured-run harness. It records evaluator-owned monotonic
  elapsed time, fixed candidate configuration, metered-or-unavailable cost and
  intervention count in the existing privacy-validated envelope. Evidence is
  create-only and SHA-256 checked in the local `.scratch` directory; it does
  not call providers, create a process boundary or authorize a trial.
- Added the measured-trial plan gate: exactly two approved candidate
  configurations run in A→B then B→A order, with equal packet fingerprint and
  a per-slot check that rejects commit/configuration/cost-source drift before
  ranking. It is local preparation only; no candidate configuration, meter or
  actual provider trial is stored in the repository.

## Green evidence

- `npm run devbench:validate` — 8 cases / 8 families / provider exposure none.
- Targeted DevBench, bake-off and URL-safety tests — 64/64.
- Nine benchmark-family suites — 214/214.
- Full suite — 58 files / 1,216 tests.
- Lint and TypeScript — pass.
- `git diff --check` — pass.
- Closeout replay — all 16 admissible candidate full suites pass; every direct
  parent and lockfile matches its frozen seed; all 16 reviewed worktrees are
  clean. Counts range from 1,209 to 1,219 because the repository evolved across
  focused cases.

## Build boundary

`next build --webpack` is currently blocked before Next.js compilation because
its build script first runs `prisma migrate deploy` and the local environment
does not provide `DATABASE_URL_UNPOOLED`, required by `prisma/schema.prisma`.
No database operation, placeholder credential or production credential was
used to bypass that boundary. It does not affect the local-only benchmark code.

## What this does not authorize

- No model, coding harness, gateway or tool candidate is adopted.
- No provider receives repository context, prompts, outputs or secrets.
- No database migration, deployment, preview, push or production action ran.
- A candidate may be compared only after a separate reviewer freezes the task
  brief, starting commit, allowed tools, time/cost cap and mutation protocol.

## Next decision

The eight-case DevBench v1 closeout is complete. The Control Tower should not
invent EF-009 inside V1 and should not adopt either candidate from the 3-3-2
technical record. The measured-run harness is now local and must be exercised
only after a reviewer supplies two approved, identical candidate configurations
and a supported metering source. The counterbalanced four-slot trial protocol
now refuses configuration or packet drift before ranking. Until an evaluator
actually executes that protocol, no merge, provider adoption, rollout or
model-selection claim is authorized. A V2 catalog remains a separate future
decision.
