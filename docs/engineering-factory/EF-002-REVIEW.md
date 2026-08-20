# EF-002 — Controlled Bake-off Review

**Status:** `BAKE-OFF IN PROGRESS` — this focused local result does not adopt a
model, provider, harness or coding workflow.

## Frozen inputs

- Candidate start commit: `749f3585ed3f1ce929375a351ff850d0a639a185`
- Candidate A (Codex): `d99b7b119102cd5dac18c900a83092a91f983c38`
- Candidate B (Claude): `74ee6bc4701bb30ddf4516b3ed225362cfde5475`
- Frozen oracle: a consumer must not mutate a published `web.fetch` schema
  limit so that a later `capabilityDescriptors()` call differs from the
  runtime constraint.
- Permitted candidate source: `src/lib/ai-work-engine/capability-contract.ts`
  only.

Both candidates have the same parent, preserve the frozen test and challenge,
modify only the permitted production file, and leave their worktrees clean.

## Independent reviewer checks

| Gate | Candidate A — Codex | Candidate B — Claude |
| --- | --- | --- |
| Frozen parent | pass | pass |
| Seeded RED | reproduced | reproduced |
| Seeded targeted test | 18/18 pass | 18/18 pass |
| Full test suite | 1,217/1,217 pass | 1,217/1,217 pass |
| TypeScript | pass | pass |
| Lint | 0 errors; 2 pre-existing warnings | 0 errors; 2 pre-existing warnings |
| Scope / diff check | one permitted source file / pass | one permitted source file / pass |
| Lockfile | unchanged | unchanged |
| Named mutation | caught and byte-restored | caught and byte-restored |
| Runtime contract text | unchanged | unchanged |

The reviewer also confirmed that `structuredClone` is already used in source
modules within this repository, and that no current caller relies on
descriptor reference identity between calls.

## Diff comparison

- Candidate A returns a fresh descriptor array, deep-clones each JSON Schema
  with the platform `structuredClone`, and copies the notes array: 9 additions
  and 1 deletion.
- Candidate B adds a custom recursive JSON clone, then applies the same
  descriptor and notes copying: 31 additions and 1 deletion.

Both changes correctly isolate nested schema and notes data. Candidate B's
clone is valid for Zod's JSON-shaped schema output, but duplicates a platform
capability already established in the repository. Candidate A is therefore
smaller, clearer, and has less bespoke cloning logic while preserving the
same observable contract.

## Decision

**Technical winner for EF-002: Candidate A (Codex).** The winner is based on
equal functional evidence plus the smaller, repository-consistent
implementation—not on model cost or elapsed time.

No cost or speed ranking exists: neither run supplied a supported measurement
source. This single winner is evidence for this narrow generated-contract
family only; it is not a general coding-model or provider adoption decision.

## Local-only statement

No push, Preview, Production action, provider call, database operation,
credential access, package installation or product-worktree modification
occurred during the review.
