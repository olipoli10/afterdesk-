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

## Green evidence

- `npm run devbench:validate` — 8 cases / 8 families / provider exposure none.
- Targeted DevBench, bake-off and URL-safety tests — 64/64.
- Nine benchmark-family suites — 214/214.
- Full suite — 58 files / 1,216 tests.
- Lint and TypeScript — pass.
- `git diff --check` — pass.

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

The Control Tower should schedule EF-004 as the next two-candidate bake-off
from the catalog, with a frozen clone, named mutation, and supported elapsed
and cost measurement sources. Score reviewer-accepted technical evidence
first; score time or cost only when the hardened harness records a supported
measurement source. A winner remains a candidate until broader evidence is
independently reviewed.
