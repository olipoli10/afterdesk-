# Implementation Plan: Controlled Provider Orchestration R37C

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-02 | **Spec**: [spec.md](spec.md)

## Summary

Add a durable local-only coordinator around R37A and R37B. Persist one leased
run, reserve before adapter invocation, store exact synthetic evidence, settle
measured cost, release on known failure and collapse completed replay.

## Technical Context

**Language**: TypeScript
**Dependencies**: Existing Zod, Prisma and Vitest only
**Storage**: Additive forward-only Prisma migration; disposable PostgreSQL
**Testing**: Unit, integration, concurrency, lease-reclaim and restart tests
**Constraints**: No dependency, lockfile, provider, credential or network change

## Constitution Check

- Closed-world capability and immutable input: PASS through R37A.
- Point-of-use authority and durable economics: PASS through R37B.
- Durable, idempotent, lease-aware execution: REQUIRED here.
- Produce, verify and deliver remain distinct: evidence is stored, not delivered.
- No external authority or observed claim: REQUIRED.

## Structure

```text
specs/125-controlled-provider-orchestration/
src/lib/construction-operating-assistant-r37c/
src/server/construction-operating-assistant-r37c/
prisma/migrations/*_construction_assistant_r37c_controlled_run/
test/construction-operating-assistant-r37c*.test.ts
test/integration/construction-operating-assistant-r37c*.itest.ts
```

Rollback disables the global lane. Run, evidence and financial history remain.
