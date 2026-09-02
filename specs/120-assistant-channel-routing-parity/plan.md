# Implementation Plan: Assistant Channel Routing Parity

## Summary

Close the discovered channel bypass by extending the server-only R36C boundary with trusted admitted-source metadata and routing R4 SMS/voice-transcript ingress through it. Reuse R2 for internal execution and R36C deferred persistence for non-internal work.

## Technical Context

- TypeScript, Next.js route handlers and Prisma/PostgreSQL
- Existing R4 adapter admission, R36A policy, R36C routing/persistence and R2 canonical executor
- No database migration or dependency change
- Disposable PostgreSQL for authorization, replay and provenance proof

## Constitution Check

- Canonical PostgreSQL state remains authoritative.
- Channel adapters authenticate/admit sources; R36C rechecks owner/admin authority.
- Provider/model choice remains hidden and server-owned.
- Consequential communication remains approval-gated.
- Deferred intelligence claims no result and performs no dispatch.
- Historical replay uses the stored decision snapshot.
- All external/provider authority remains false.

## Design

1. Add a strict server-only admitted-source contract for non-portal channels.
2. Build the R2 envelope inside R36C so the original channel and provenance survive.
3. Preserve admitted source metadata in deferred inbound rows.
4. Replace R4's direct R2 call with R36C.
5. Add unit wiring and PostgreSQL parity/replay tests.
6. Run focused regressions, typecheck, lint and queue/router validation.

## Rollback

Revert R36D files and the R4 inbound wiring commit. No migration, provider state or external side effect exists.
