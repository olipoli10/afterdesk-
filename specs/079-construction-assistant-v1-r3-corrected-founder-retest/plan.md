# Implementation Plan: Construction Assistant V1 R3 Corrected Founder Retest

## Technical context

- Next.js 16.2.12 App Router and Server Actions, using the installed local documentation.
- Existing Construction Assistant V1 services and corrected R2 actions remain the business-logic boundary.
- Prisma 6.19.3 against a named disposable local PostgreSQL instance; no schema or migration change.
- A temporary authenticated page, client component and R3-only server action guarded by explicit local-test mode.
- Spec-owned, closed JSON session/evidence with atomic local writes; no new dependency.
- Vitest RED/contract tests plus a real disposable-PostgreSQL dry run.

## Constitution and safety check

- Server Actions are treated as untrusted POST endpoints: authenticate, authorize, validate, and rederive workspace ownership.
- Founder completion cannot be created by a fixture or dry run.
- All technical results come from PostgreSQL or closed service results, not UI assertions.
- Provider identity is opaque and server-owned; no real transport path is introduced.
- The temporary route is fail-closed outside development plus an explicit R3 flag.
- ADR-047 measures remain independent and unchanged without rubric evidence.

## Architecture

```text
authenticated localhost:3000/client/construction-retest
                         |
            guarded R3 Server Actions
                         |
        existing Construction Assistant services
                         |
              disposable PostgreSQL
                         |
 integrated Projects / Calendar / Inbox projections
                         |
 closed founder answers + measured facts -> adjudication
```

## File structure

- `specs/079-.../`: requirements, contracts, scripts, immutable evidence and adjudication.
- `src/app/client/construction-retest/`: temporary local-only page.
- `src/components/construction-assistant-v1/founder-retest/`: temporary one-screen console.
- `src/server/actions/construction-assistant-v1-r3-retest.ts`: temporary guarded orchestration only.
- `test/construction-assistant-v1-r3-founder-retest*.test.ts`: contract, mode, sequence, replay and PostgreSQL proof.

## Phases

1. Freeze R3 contract, guided UX, immutable baseline and RED.
2. Implement guarded console, disposable environment and complete technical dry run.
3. Run exactly one real Olivier session and seal its outputs.
4. Adjudicate, remove temporary product surface, validate, commit and checkpoint Brain.

## Post-design constitution check

PASS. The design adds no lasting product authority, transport, provider, customer data, schema, migration or dependency. Authentication and workspace checks remain mandatory, technical truth remains database-backed, and the only irreducible human evidence is Olivier's one submission.
