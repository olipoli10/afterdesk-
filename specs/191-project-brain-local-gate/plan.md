# Implementation Plan: Project Brain Local Gate

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/191-project-brain-local-gate/spec.md`

## Summary

Build one credential-free PowerShell gate that creates an owned disposable PostgreSQL environment, drives a complete synthetic R36V→R36Y Project Brain workflow with an exact harness-declared Friday/Monday `OWNER_TEXT` contradiction through product boundaries and visible mobile controls, proves restart/replay/concurrency/tenancy/role/raw-SQL invariants, instruments every forbidden external effect at zero, then allowlist-aggregates isolated test fragments and atomically finalizes one strict machine-readable report after cleanup before closeout.

## Technical Context

**Language/Version**: PowerShell 7 plus repository TypeScript/Vitest/Next.js/Expo/Prisma toolchain

**Primary Dependencies**: Existing R36V–R36Y modules/tests, Vitest, Prisma/PostgreSQL, Expo test harness and repository scripts; no new dependency

**Storage**: Fresh uniquely owned disposable local PostgreSQL and bounded repository evidence JSON/Markdown

**Testing**: Integrated synthetic test, targeted/full serialized root/mobile suites, real PostgreSQL raw-SQL/restart/concurrency tests, mutation matrix, lint/typecheck/provider-boundary/Webpack build

**Target Platform**: Local Windows/PowerShell, existing Next.js server and Expo mobile test surfaces

**Project Type**: Validation orchestration and evidence gate

**Performance Goals**: One deterministic invocation; bounded assertions/mutations; no indefinite wait; cleanup always attempted and verified

**Constraints**: Credential-free/local/synthetic only; zero provider/network/external effect/spend; no shared DB; no push/Preview/Production/deployment/store; no metric inflation

**Scale/Scope**: One validator, one integrated scenario test, one mobile journey test extension, one strict report and one closeout

## Constitution Check

*GATE: PASS before Phase 0 and PASS after Phase 1 design.*

- **I**: PASS — gate owns setup, execution, evidence and cleanup.
- **II**: PASS — complete assertion allowlist and fail-closed missing/skipped behavior.
- **III**: PASS — synthetic tenants/roles, no credentials/external effects/spend.
- **IV**: PASS — genuine restart, replay/concurrency and deterministic cleanup.
- **V**: PASS — execution, assertions, machine report and closeout are separate gates.
- **VI**: PASS — labels remain TEST/SYNTHETIC; no market/customer inference.
- **VII**: PASS — composes existing releases/tests rather than adding product scope.
- **Stack practice**: PASS by design — real PostgreSQL, serialized full suites and build required.

## Project Structure

### Documentation/evidence

```text
specs/191-project-brain-local-gate/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── analyze.md
├── checklists/requirements.md
├── contracts/project-brain-local-gate-report.md
├── tasks.md
├── scripts/validate-r36z-project-brain-local-gate.ps1
└── evidence/
    ├── local-gate-report.json
    ├── mutations.md
    └── closeout.md
```

### Planned test integration

```text
test/integration/construction-operating-assistant-r36z-project-brain-local-gate.itest.ts
apps/mobile/test/project-brain-local-gate.test.ts
```

**Structure Decision**: R36Z adds validation/evidence only. It uses public product boundaries and existing tests; it adds no production model, route, UI or migration.

## Delivery Phases

### Phase 0 — Gate contract and RED

- Freeze fragment/assertion/mutation/report allowlists, isolated-writer ownership and fail-closed terminal rules.
- Add RED proving the validator fails on missing chain assertions, skipped tests, nonzero effect counters, same-process restart and ID-driven UI shortcuts.

### Phase 1 — Integrated scenario and adversarial proof

- Build the synthetic two-tenant R36V→R36Y integration scenario, including the two exact incompatible owner-brief assertions and explicit harness declaration, through authenticated product services/routes.
- Add fresh-process restart hashes, exact/concurrent replay and role/tenant/body-drift tests.
- Compose existing R36V–R36Y raw-SQL guard suites.

### Phase 2 — Mobile flow and zero-effect instrumentation

- Drive visible project intake/review/assistant controls without copied IDs.
- Install provider/credential/network/semantic-binary/transport/write/approval/delivery/spend sentinels and retain exact zero counters.

### Phase 3 — Validator, mutations, full gates and closeout

- Orchestrate owned DB/process setup, targeted tests, integrated/mobile tests, mutations and full serialized tests/static/build; accept only isolated allowlisted fragments, verify cleanup, then atomically finalize/validate the report and create closeout.
- Create closeout only from the validated machine report; preserve separate readiness/evidence labels.

## Complexity Tracking

No constitution violation. One orchestration script and strict report are justified because selective manual command execution cannot prove completeness, zero effects or cleanup atomically.
