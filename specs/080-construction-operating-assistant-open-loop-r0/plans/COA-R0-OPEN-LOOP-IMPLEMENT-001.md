# COA-R0-OPEN-LOOP-IMPLEMENT-001

## Objective

Implement one workspace/project-scoped invoice-readiness OpenLoop by extending Construction Assistant V1, with deterministic policy, explicit unknowns, missing evidence, contradictions, verification, next actor, replay refusal and role-safe projections.

## Scope

- `specs/080-construction-operating-assistant-open-loop-r0/**`
- `src/lib/construction-operating-assistant-r0/**`
- `src/server/construction-operating-assistant-r0/**`
- bounded Construction Assistant V1 bridge/projection files
- `prisma/schema.prisma` and one forward-only additive migration
- `test/construction-operating-assistant-r0*.test.ts`
- matching disposable-PostgreSQL integration tests

## Acceptance

- Non-vacuous RED precedes implementation.
- Missing/contradictory/unverified facts cannot become invoice-ready.
- Duplicate, conflicting replay and cross-project/cross-workspace input fail closed.
- Field worker receives no financial data.
- Transition, snapshot and audit are atomic.
- No external transport or package-lock change.

## Completion command

`npm.cmd run test:run -- test/construction-operating-assistant-r0*.test.ts`

