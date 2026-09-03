# Implementation Plan: Provider Delivery Contracts R37D

**Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous` | **Date**: 2026-09-02 | **Spec**: [spec.md](spec.md)

## Summary

Add pure, provider-specific response schemas and deterministic normalizers for
the two R36B candidates. Bind every fixture to the sealed R37A request, enforce
R36B ceilings and emit one transport-free canonical evidence contract.

## Technical Context

**Language**: TypeScript
**Dependencies**: Existing Zod and Vitest only
**Storage**: None
**Testing**: Unit fixtures, exact mutation guards and source scan
**Constraints**: No provider client, network, credential, dependency or lockfile change

## Constitution Check

- Closed-world schemas and exact request binding: REQUIRED.
- Provider output is evidence, never canonical state by itself: REQUIRED.
- Synthetic evidence cannot be reported as observed: REQUIRED.
- No authority expansion: REQUIRED.

## Structure

```text
specs/126-provider-delivery-contracts/
src/lib/construction-operating-assistant-r37d/
test/construction-operating-assistant-r37d*.test.ts
```
