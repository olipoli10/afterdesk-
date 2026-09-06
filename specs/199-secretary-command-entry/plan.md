# Implementation Plan: Secretary command entry

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-05 | **Spec**: [spec.md](spec.md)

## Summary

Turn the seven R38B capability cards into one-tap entries to the existing assistant or the exact existing connection surface. A pure bounded-prefill helper owns route-parameter safety. Navigation never submits.

## Technical Context

- TypeScript 5, React Native and Expo Router in `apps/mobile`
- Existing `assistant.tsx`, `calendar-connections.tsx`, `calls.tsx` and TextAssist setup
- Vitest pure mobile contract tests
- No database, migration, provider, credential or network work

## Constitution Check

- Existing product surfaces are reused; no duplicate assistant or test console.
- The app does not auto-submit or widen role authority.
- External effects and connector grants remain zero.
- TDD and exact local evidence are required.

## Design

1. Add an immutable `entry` contract to every R38B mobile capability.
2. Add a pure helper that accepts one route parameter and returns a bounded prompt or `null`.
3. Make every TextAssist capability card pressable and deterministic.
4. Let the existing assistant consume a safe prefill once without submission.
5. Prove all seven entries, malformed inputs and zero-effect copy.

## Project Structure

```text
apps/mobile/src/lib/virtual-secretary-actions.ts
apps/mobile/src/app/(app)/text-assist.tsx
apps/mobile/src/app/(app)/assistant.tsx
apps/mobile/test/secretary-command-entry.test.ts
specs/199-secretary-command-entry/
```

## Gates

- Seven exact entries
- No auto-submit
- Mobile focused tests, typecheck and lint pass
- Provider boundary remains clean
- No readiness metric changes
