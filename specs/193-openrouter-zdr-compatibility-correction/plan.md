# Implementation Plan: OpenRouter ZDR Compatibility Correction

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-05 | **Spec**: [spec.md](spec.md)

## Summary

Create an additive, credential-free R37B compatibility layer that validates a dated OpenRouter endpoint snapshot, proves why the frozen R37 request had no eligible ZDR endpoint, and builds the corrected request shape with `max_completion_tokens` and no unsupported sampling field. Preserve the R37 code and report unchanged. Do not add transport or execution reach.

## Technical Context

**Language/Version**: TypeScript 5.x and Windows PowerShell 5.1

**Primary Dependencies**: Zod, Vitest, Node.js cryptography and existing R37 schemas/cases

**Storage**: Versioned JSON evidence only; no database change

**Testing**: Contract/unit tests, source mutation tests, provider-boundary gate, lint, typecheck and sealed-report hash verification

**Target Platform**: Existing local Node.js server/tooling environment

**Project Type**: Server-only library and local validation script

**Performance Goals**: Compatibility evaluation completes under one second for fewer than 100 endpoints per model

**Constraints**: Zero credential access, zero generation calls, zero spend, immutable R37 report, no public route

**Scale/Scope**: Two exact models, five currently ZDR-compatible endpoints and one corrected request contract

## Constitution Check

- **I — Owned outcome**: PASS. The result is a single actionable retest-readiness decision.
- **II — Closed-world immutable contracts**: PASS. R37 remains sealed; R37B is a new version.
- **III — Authorization/privacy/money**: PASS. No credential, spend or provider generation call exists.
- **IV — Durable execution**: PASS. No external execution step is introduced.
- **V — Evidence separation**: PASS. Public metadata, inference and future observed provider evidence remain distinct.
- **VI — Evidence-led economics**: PASS. The correction removes one proven compatibility defect without claiming market value.
- **VII — Incremental testing**: PASS. Additive module; no rewrite, schema or migration.

## Project Structure

```text
specs/193-openrouter-zdr-compatibility-correction/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── goal.md
├── tasks.md
├── CONTINUATION_QUEUE.json
├── contracts/openrouter-zdr-compatibility.md
├── checklists/requirements.md
└── evidence/

src/lib/construction-operating-assistant-r37bb/
└── contracts.ts

test/
└── construction-operating-assistant-r37bb-zdr-compatibility.test.ts
```

**Structure Decision**: Add a new server-only pure compatibility module and retain every R37 file unchanged.

## Complexity Tracking

No constitutional violation or new dependency is introduced.
