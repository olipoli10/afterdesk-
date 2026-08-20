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

## Green evidence

- `npm run devbench:validate` — 8 cases / 8 families / provider exposure none.
- Targeted DevBench tests — 6/6.
- Nine benchmark-family suites — 214/214.
- Full fast suite — 56 files / 1,200 tests.
- Lint and TypeScript — pass.
- `git diff --check` — pass.

## Build boundary

`next build --webpack` compiled the application and completed TypeScript, then
failed while collecting `/api/cron/maintenance` because no R2 production
credentials are present. This is intentionally not bypassed with placeholder
or production credentials. It does not affect the local-only benchmark code.

## What this does not authorize

- No model, coding harness, gateway or tool candidate is adopted.
- No provider receives repository context, prompts, outputs or secrets.
- No database migration, deployment, preview, push or production action ran.
- A candidate may be compared only after a separate reviewer freezes the task
  brief, starting commit, allowed tools, time/cost cap and mutation protocol.

## Next decision

The Control Tower should schedule a two-candidate bake-off on a frozen clone
of this catalog. Score accepted-result cost and reviewer acceptance, not raw
test count. The winner remains a candidate until the evidence is independently
reviewed.
