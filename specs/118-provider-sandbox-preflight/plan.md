# Implementation Plan: ENDVERA Provider Sandbox Preflight R36B

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-02 | **Spec**: [spec.md](spec.md)

## Summary

Extend R36A with a credential-free provider boundary that prepares strict Perplexity Search and OpenRouter controller request plans, normalizes synthetic provider fixtures, compares equal-input candidates deterministically, and produces the exact non-authorized R37 campaign manifest. R36B performs no network request, reads no secret, selects no winning model and changes no persistent schema.

## Technical Context

**Language/Version**: TypeScript under the existing Node.js toolchain
**Primary Dependencies**: Existing Zod schemas and canonical hashing only; no provider SDK or new dependency
**Storage**: No runtime storage; immutable specification fixtures and sealed local evidence only
**Testing**: Vitest contract tests plus targeted R36A/Model Gateway regression, lint and typecheck
**Target Platform**: Server-only ENDVERA routing/provider-preflight modules
**Project Type**: Existing Next.js/TypeScript monolith
**Performance Goals**: Deterministic local compilation; replay produces byte-stable fingerprints
**Constraints**: Zero network, zero secret read, zero provider dispatch, integer microdollars, strict unknown-field refusal
**Scale/Scope**: Three candidate route families, bounded cases, maximum twelve proposed R37 calls

## Constitution Check

- **Owned outcome**: PASS. One bounded observation path; no customer promise.
- **Closed world**: PASS. Provider keys, endpoint families, profiles, schemas and privacy modes are strict registries.
- **Authorization/privacy/economics**: PASS. Plans are non-dispatchable; secret-reference names only; missing authorization refuses.
- **Durability/replay**: PASS. No external effect; fingerprints are deterministic and mismatch refuses.
- **Verification separation**: PASS. Preparation, response, schema validity, source support and future certification are distinct.
- **Evidence/economics**: PASS. Local outputs remain `SYNTHETIC`; quality and cost are `UNKNOWN` until observed.
- **Incremental/proportionate**: PASS. R36A is extended without schema, dependency, mobile or portal changes.

The check remains PASS after Phase 1 design. No exception is required.

## Project Structure

```text
specs/118-provider-sandbox-preflight/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/provider-preflight.md
├── checklists/requirements.md
└── tasks.md

src/lib/construction-operating-assistant-r36b/
├── contracts.ts
├── candidates.ts
├── perplexity.ts
├── openrouter.ts
├── benchmark.ts
└── campaign.ts

test/
└── construction-operating-assistant-r36b-provider-sandbox-preflight.test.ts
```

**Structure Decision**: Keep preparation in a new server-only R36B module beside R36A. It may produce inert plans and normalize supplied synthetic fixtures; it contains no HTTP client, SDK import or environment access.

## Implementation Sequence

1. Freeze strict candidate, plan, evidence, observation, comparison and campaign contracts.
2. Register dated candidate packets and explicit internal model profiles.
3. Compile and normalize bounded Perplexity Search fixtures with privacy enforcement.
4. Compile OpenRouter plans with explicit profile, parameter support, denied collection, ZDR and disabled fallback.
5. Compare equal synthetic cases; fail on drift, unsupported claims, unequal ceilings or excess spend.
6. Emit the exact `PREPARED_NOT_AUTHORIZED` R37 campaign manifest with secret-reference names only.
7. Run targeted regressions, typecheck, lint and hygiene checks.

## Rollback

Delete the R36B module, targeted test and feature specification. No database, dependency, accepted record or external system requires rollback.

## Complexity Tracking

No constitution violation.
