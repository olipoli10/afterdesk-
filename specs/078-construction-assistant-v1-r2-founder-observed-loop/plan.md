# Implementation Plan: Construction Assistant V1 R2 Founder Observation

## Technical context

- Existing Next.js 16.2.12 product remains immutable before observation.
- Spec-owned TypeScript/PowerShell harness with Node core HTTP for the local observation form.
- Existing Prisma 6.19.3 schema applied to a named disposable PostgreSQL instance.
- Existing Better Auth database shapes used only for a synthetic local CLIENT identity.
- Zod-closed JSON evidence, Vitest guards and SHA-256 sealing.
- No dependency or lockfile change.

## Constitution and safety check

- Human observation is evidence only when Olivier submits it.
- Product source is frozen until a reproduced defect exists.
- Equal inputs prevent a deliberately weak substitute comparison.
- Database, account, email and phone values remain disposable and synthetic.
- No provider or external transport path is available.
- ADR-047 metrics remain independent and evidence-driven.

## Architecture

```text
immutable V1 + disposable PostgreSQL
              |
      exact synthetic dossier
              |
    local product + observation guide
              |
       Olivier performs 8 actions
              |
 closed observation packet + technical checks
              |
 equal-input stateless control -> deterministic adjudication
```

## File structure

- `specs/078-.../`: specification, closed contracts, scripts, evidence and observation UI.
- `test/construction-assistant-v1-r2-observed*.test.ts`: harness, fairness and verdict guards.
- Existing V1 source paths: correction only after a sealed reproduced defect.

## Phases

1. Freeze subject, test contract, metrics and RED.
2. Prepare disposable environment, synthetic identity and local observation form.
3. Run one real founder session and seal its output.
4. Adjudicate, correct only a bounded defect if necessary, validate and checkpoint.

## Post-design constitution check

PASS. The plan adds no production capability, provider, customer data, migration, dependency or external authority. The only irreducible human step is Olivier's one observation session.
