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
- Added the ignored local configuration-manifest template. It starts in DRAFT,
  rejects placeholders and sensitive field names recursively, and cannot yield
  a trial plan until an evaluator provides two approved non-secret candidate
  descriptions plus the exact per-case frozen seed map. V2 cost remains
  explicitly unavailable and cannot be ranked.
- Added `npm run devbench:dry-run:preflight`: a local, read-only gate that
  refuses a DRAFT or invalid manifest before any candidate process, provider
  or network activity can begin. `DRY_RUN_PREFLIGHT_READY` is preparation
  evidence, never execution evidence.
- Rehearsed all 32 V2 schedule slots in detached case-specific worktrees. The
  rehearsal verifies frozen seeds, clean state, challenge-document hashes and
  cleanup while proving `candidateInvocations: 0` and `providerCalls: 0`.
- Added the Candidate Execution Boundary v1. Its create-only DRAFT binds the
  exact V2 plan fingerprint to exact runner artifact fingerprints plus opaque
  references for network policy, provider data boundary and independent
  review. The read-only `devbench:execution:preflight` fails closed without
  those approved proofs and contains no process launcher.
- Completed the first independent-runner evidence review without launching a
  candidate. Exact installed Codex/Claude versions, binary signatures and
  SHA-256 fingerprints are recorded, but execution remains NO-GO: current
  wrappers inherit the environment, expose the prompt in process arguments,
  use a linked worktree without OS file isolation, provide unequal candidate
  capabilities, do not enforce egress and stream raw output to the console.
  `ADR_INDEPENDENT_CANDIDATE_RUNNER_V1.md` selects a future external isolated
  supervisor; the authority remains DRAFT.
- Added the provider-free Synthetic Isolated Runner v1. It executes two local
  deterministic synthetic participants with the same Node 26 permission
  profile, fresh allowlisted environments, stdin-only input, bundle-only read,
  result-only write, no network/child/worker grant, bounded raw streams and
  destroy-before-return semantics. The rehearsal records source and bundle
  fingerprints plus control metadata while proving 0 real candidate
  invocations and 0 provider calls. Eight named mutations cover environment,
  filesystem, SQLite bypass, network, child process, input arguments, raw
  output and profile parity. This remains `CODE + TEST + SYNTHETIC`: Node's
  Permission Model is not an OS security boundary, so native CLI execution and
  the execution authority remain blocked.
- Added the native-isolation backend ADR and a read-only fail-closed host
  preflight. The current Windows 11 Home machine has no functional WSL or
  Docker/Podman backend; it records `NATIVE_ISOLATION_SETUP_REQUIRED`, zero
  candidate/provider calls and no host mutation. WSL2 plus a hardened Linux
  container is proposed only as a separately authorized setup candidate. A
  dedicated Hyper-V VM remains the deferred stronger Windows-native option.

## Green evidence

- `npm run devbench:validate` — 8 cases / 8 families / provider exposure none.
- Targeted DevBench, bake-off and URL-safety tests — 64/64.
- Candidate Execution Boundary and adjacent V2 gates — 16/16.
- Synthetic isolated runner — 9/9.
- Native isolation preflight — 7/7; current host exits 1 fail-closed with setup
  required.
- Nine benchmark-family suites — 214/214.
- Full suite — 67 files / 1,259 tests.
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
technical record. The measured-run harness and counterbalanced 32-slot V2 plan
are local. Their Git mechanics have been rehearsed, but a real model CLI still
requires provider egress that the repository does not create or prove. The next
decision is an independent review of the actual external network policy,
provider data boundary and exact runner binaries/wrappers. Until that evidence
is referenced by an APPROVED Candidate Execution Boundary file and independently
verified, the execution preflight must refuse and no candidate may run. The
provider-free synthetic runner proves that the intended control contract is
testable but cannot replace an OS isolation boundary for native candidate code.
Even a successful preflight would authorize review only: no merge, provider adoption,
rollout or model-selection claim follows. A V2 catalog remains a separate future
decision.
