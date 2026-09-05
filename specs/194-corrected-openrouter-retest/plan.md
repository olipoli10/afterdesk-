# Implementation Plan: Corrected OpenRouter Retest

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-05 | **Spec**: [spec.md](spec.md)

## Summary

Add one explicit corrected request version to the already-authorized private OpenRouter transport, create a replay-refusing runner and masked launcher in a new feature directory, execute the frozen R37 matrix once against a disposable PostgreSQL database, seal PASS or REWORK, and close every temporary authority. The earlier R37 report remains immutable.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js, Windows PowerShell 5.1

**Primary Dependencies**: Zod, Vitest, Prisma 6, existing R37 campaign/oracle/activation controls

**Storage**: Disposable PostgreSQL plus new JSON evidence; no schema change

**Testing**: RED/GREEN unit tests, real disposable PostgreSQL integration, provider-boundary validation, lint and typecheck

**Target Platform**: Local Windows workstation and one OpenRouter HTTPS endpoint

**Project Type**: Server-only bounded campaign tooling

**Performance Goals**: At most six provider calls, 30-second timeout per call, no retry

**Constraints**: Synthetic data only; 5 USD application ceiling and 10 CAD founder ceiling; credential ephemeral; no public route or external action

**Scale/Scope**: Two exact models by three frozen cases in one campaign

## Constitution Check

- **I** PASS: one owned provider-evaluation outcome with explicit closure.
- **II** PASS: explicit corrected request version; prior R37 contract/report stay immutable.
- **III** PASS: masked ephemeral credential, durable reserve/settle controls and stricter dual ceiling.
- **IV** PASS: no customer operation or human dumping is introduced.
- **V** PASS: dispatch, canonical observation, oracle and verdict remain separate facts.
- **VI** PASS: exact denominator, spend and evidence labels are retained.
- **VII** PASS: incremental transport option and proportional PostgreSQL/security tests; no rewrite.

## Project Structure

```text
specs/194-corrected-openrouter-retest/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── goal.md
├── tasks.md
├── LONG_RUN_PROGRAM.json
├── CONTINUATION_QUEUE.json
├── contracts/openrouter-corrected-retest.md
├── checklists/requirements.md
├── scripts/validate-r37-corrected-retest.ps1
└── evidence/

src/lib/construction-operating-assistant-r37/transport.ts
scripts/run-r37-corrected-openrouter-retest.ts
scripts/start-r37-corrected-openrouter-retest-secure.ps1
test/construction-operating-assistant-r37-corrected-retest.test.ts
```

**Structure Decision**: Reuse the sole audited private transport and frozen campaign controls through an explicit request-version switch. All new run artifacts use feature 194.

## Complexity Tracking

No new dependency, public route, database schema or provider abstraction is added.
