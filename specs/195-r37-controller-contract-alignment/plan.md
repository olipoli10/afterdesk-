# Implementation Plan: R37 Controller Contract Alignment

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-05 | **Spec**: [spec.md](spec.md)

## Summary

Correct the smallest local contract inconsistency revealed by R37: permit state answers for the invoice-readiness decision and serialize each case's allowed capabilities and required limitations into the bounded request. Prove it with RED/GREEN tests while preserving the paid observation byte-for-byte.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js

**Primary Dependencies**: Zod, Vitest, existing R37/R37BB contracts and oracle

**Storage**: Existing immutable JSON evidence; no database or schema change

**Testing**: Focused contract/oracle tests, existing R37 suites, typecheck, provider-boundary validator

**Target Platform**: Server-only local controller library

**Project Type**: Contract correction

**Performance Goals**: No runtime overhead beyond two small arrays in one bounded request

**Constraints**: Zero provider calls, credentials, spend or external effects; preserve the sealed report

**Scale/Scope**: Three frozen synthetic cases and one corrected request builder

## Constitution Check

- **I** PASS: the bounded outcome remains owned and explicit.
- **II** PASS: the planner-visible contract is derived from the enforced case contract.
- **III** PASS: no credential, provider access, spend or external action.
- **IV** PASS: no human fallback or workflow change.
- **V** PASS: local correction and historical observed evidence stay separate.
- **VI** PASS: denominator remains three cases; evidence label is TEST, not OBSERVED.
- **VII** PASS: minimal incremental correction with regression tests; no historical reinterpretation.

## Project Structure

```text
specs/195-r37-controller-contract-alignment/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── goal.md
├── tasks.md
├── contracts/controller-contract.md
├── checklists/requirements.md
└── evidence/

src/lib/construction-operating-assistant-r37/cases.ts
src/lib/construction-operating-assistant-r37bb/contracts.ts
src/lib/construction-operating-assistant-r37bc/cases.ts
test/construction-operating-assistant-r37bc-controller-contract-alignment.test.ts
```

**Structure Decision**: Preserve the original frozen cases and add one explicit versioned alignment module. Reuse the current server-only request and oracle; add no endpoint, persistence or dependency.

## Complexity Tracking

No constitution violation or new complexity is introduced.
