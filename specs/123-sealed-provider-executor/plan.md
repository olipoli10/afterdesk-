# Implementation Plan: ENDVERA Sealed Provider Executor R37A

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-02 | **Spec**: [spec.md](spec.md)

## Summary

Build a pure server-side seal between R36B candidate-only request plans and a
future provider observation. The seal is local and synthetic-only: it validates
immutable R36B packets, preserves privacy/cost constraints, accepts only an
injected test transport declaring no external dispatch, and refuses observed
provider mode. No credential or network capability is introduced.

## Technical Context

**Language/Version**: TypeScript, existing Next.js server code  
**Primary Dependencies**: Existing Zod and Vitest only  
**Storage**: N/A; pure in-memory contract layer  
**Testing**: Vitest targeted unit tests plus R36C regression  
**Target Platform**: Local Node/Next.js server  
**Project Type**: Existing web application, server library only  
**Performance Goals**: Pure validation; inherited R36B limits  
**Constraints**: No fetch, provider SDK, environment-secret read, public route,
migration, dependency/lockfile edit or external effect  
**Scale/Scope**: One sealed synthetic attempt; observed activation is separate

## Constitution Check

| Gate | Result | Evidence |
|---|---|---|
| Local-only authority | PASS | Spec forbids credentials, transport, spending and customer data. |
| Fail-closed action safety | PASS | Seal validates before adapter invocation; observed execution refuses. |
| Provenance and truth labels | PASS | Result is `SYNTHETIC`, never observed/certified. |
| Reuse current architecture | PASS | Reuses R36B packets, cases, plans and fingerprints. |
| No avoidable scope | PASS | Pure TypeScript; no Prisma/dependency change. |

Re-check after design: **PASS**. No complexity violation.

## Project Structure

```text
specs/123-sealed-provider-executor/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/sealed-executor-contract.md
└── tasks.md

src/lib/construction-operating-assistant-r37a/contracts.ts
src/server/construction-operating-assistant-r37a/sealed-executor.ts
test/construction-operating-assistant-r37a-sealed-executor.test.ts
```

**Structure Decision**: Server-only modules without a route or automatic
consumer. Tests inject a local transport directly.
