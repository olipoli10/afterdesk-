# Implementation plan

## Technical context

- Next.js 16 App Router with a server page and narrow client console.
- React 19 `useActionState` for sequential server mutations.
- Prisma/PostgreSQL canonical state; Better Auth for synthetic local access.
- Existing R0 invoice-readiness evaluator and open-loop engine are reused.

## Constitution gates

- Accepted Spec Kit artifacts define the contract before code.
- RED contract/preflight tests precede implementation.
- The historical R37 observations and reports remain byte-identical.
- Provider boundary, tenant isolation and zero external transport remain mandatory.
- No human result is written during automated validation.

## Build sequence

1. Freeze the R38 scenario, observation contract and stop conditions.
2. Add RED tests for direct local access, one-action UI, PostgreSQL-derived measurements and absence of a preflight observation.
3. Port the already proven invoice-readiness founder harness onto the current canonical engine, under an R38-specific feature path and flags.
4. Add one-time loopback access, a disposable database launcher and a single French console.
5. Run contract, unit, PostgreSQL, build, provider-boundary and secret-hygiene checks.
6. Start the disposable campaign and open only the direct access link.
7. Wait for the one real Olivier session; adjudication and closeout are a later step triggered by the sealed observation.

## Rollback

Remove only the R38 route, component, server harness and feature directory. Do not alter canonical migrations or historical R37 evidence.
