# Implementation Plan: Provider Activation Controls R37B

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-02 | **Spec**: [spec.md](spec.md)

## Summary

Extend R37A with a durable local-only activation control plane: strict grants,
transactional microdollar reservations, idempotent settle/release, revocation and
global kill switch. Use existing TypeScript, Prisma and PostgreSQL patterns. No
provider client, credential resolver or network path is introduced.

## Technical Context

**Language**: TypeScript  
**Dependencies**: Existing Zod, Prisma, Vitest  
**Storage**: Forward-only Prisma migration; disposable PostgreSQL validation  
**Testing**: Unit, integration, concurrency and replay tests  
**Constraints**: Local synthetic only; no dependency or lockfile change

## Constitution Check

- Closed-world capability and immutable grant: PASS.
- Point-of-use role, workspace and policy checks: REQUIRED.
- Reserve then settle-or-release money lifecycle: REQUIRED.
- Atomic transitions and audit: REQUIRED.
- No secret or external transport: REQUIRED.
- Synthetic label retained: REQUIRED.

## Structure

```text
specs/124-provider-activation-controls/
src/lib/construction-operating-assistant-r37b/
src/server/construction-operating-assistant-r37b/
prisma/migrations/*_construction_assistant_r37b_provider_activation/
test/construction-operating-assistant-r37b*.test.ts
test/integration/construction-operating-assistant-r37b*.itest.ts
```

No user-facing route is added. Rollback disables the lane and preserves ledger/audit history.
