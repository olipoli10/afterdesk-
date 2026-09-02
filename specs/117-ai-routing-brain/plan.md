# Implementation Plan: ENDVERA AI Routing Brain R36A

## Summary

Extend, do not replace, the existing Model Gateway with a local-only assistant
routing layer. The layer converts one channel-neutral request into a closed
capability plan, prioritizes canonical internal tools, prepares specialist/model
candidates behind immutable policies, and fails closed before dispatch.

## Technical Context

- Language: TypeScript under the existing Node.js runtime.
- Validation: existing Zod dependency and canonical SHA-256 helpers.
- Persistence: no schema change in R36A; decisions are pure immutable values for
  local validation. Model Gateway PostgreSQL persistence remains the R37 execution boundary.
- Integration: existing `src/server/model-gateway` is authoritative; R36A adds a
  planning facade and candidate-only catalogue, never a second dispatcher.
- Testing: unit and contract tests; no provider or network test.
- Performance: bounded catalogues, deterministic ordering and no network path.

## Constitution Check

- **I Owned outcomes**: PASS — every route names a result, failure and resolution owner.
- **II Closed world**: PASS — capability and route keys are strict registries.
- **III Authorization/privacy/money**: PASS — data-class, privacy, risk and cost ceilings fail closed.
- **IV Hybrid execution**: PASS — human fallback is typed and resumable.
- **V Verification**: PASS — routing, provider response and verified result remain separate.
- **VI Economics**: PASS — selection considers bounded cost and cannot claim global superiority.
- **VII Incremental evolution**: PASS — existing Model Gateway is extended without schema or dependency changes.

## Architecture

1. **Request classifier** converts text/channel metadata to one or more closed intent classes.
2. **Capability registry** maps intent classes to internal tools, specialized research,
   controller reasoning, document understanding or human support.
3. **Safety compiler** sets data class, privacy, approval, citation and forbidden-research rules.
4. **Policy resolver** chooses the first eligible version-pinned route and explicit fallbacks.
5. **Decision projector** exposes bounded reasons and hashes with `externalDispatch=false`.
6. **Existing Model Gateway** will persist/admit/dispatch a selected external route only in R37.

## File Structure

- `src/lib/construction-operating-assistant-r36a/contracts.ts`
- `src/lib/construction-operating-assistant-r36a/registry.ts`
- `src/lib/construction-operating-assistant-r36a/classifier.ts`
- `src/lib/construction-operating-assistant-r36a/router.ts`
- `src/server/model-gateway/assistant-routing.ts`
- `test/construction-operating-assistant-r36a-ai-routing-brain.test.ts`

## Gates

- No schema, migration, dependency or lockfile change.
- No process environment credential read.
- No fetch, provider SDK, dispatch or external effect.
- Unknown keys, mixed consequential intents and restricted-person research fail closed.
- Route decisions are deterministic, hash-bound and content-free.
- Existing Model Gateway and R36 tests remain green.

## Rollback

Remove the R36A facade and candidate catalogue; no database or historical record
requires migration. R37 remains blocked until a later explicit policy is published.

## Post-Design Constitution Check

PASS. No constitutional exception is required.

