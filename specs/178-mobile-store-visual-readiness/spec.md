# Feature Specification: Mobile Store Visual Readiness

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`  
**Created**: 2026-09-03  
**Status**: Accepted for autonomous local implementation

## Goal

Replace starter mobile artwork with one coherent ENDVERA candidate asset system and create a deterministic local screenshot-capture package for the assistant-first iOS and Android experience. Candidate visuals remain local and must not be called approved, device-observed, signed, uploaded or published.

## User stories

### US1 — Recognize ENDVERA on a phone (P1)

The installed local build uses an ENDVERA-specific icon, adaptive Android layers, splash image and favicon that remain legible at required sizes.

### US2 — Prepare credible store storytelling (P1)

The release package defines and locally renders a bilingual shot sequence showing Today, Assistant, Projects, Calendar and approval trust without exposing synthetic technical identifiers.

### US3 — Keep evidence honest (P1)

Every candidate asset and screenshot is labeled local/candidate. Real iOS and Android device capture, legal review, signing, upload and publication remain blockers.

## Requirements

- **FR-001**: Preserve the existing ENDVERA mark geometry and dark/amber product system unless a new founder brand decision is recorded.
- **FR-002**: Generate deterministic source artwork and all Expo-referenced raster dimensions without a new dependency.
- **FR-003**: Validate transparency, dimensions, file presence and non-placeholder hashes.
- **FR-004**: Define French and English screenshot captions for the five primary mobile destinations.
- **FR-005**: Produce only local candidate screenshots or frames; never label browser-rendered frames as real-device evidence.
- **FR-006**: Keep `signed`, `uploaded`, `submitted`, `published`, `deployed`, `providerObserved` and `customerObserved` false.
- **FR-007**: Use no store account, credential, provider, customer data, external transport, push, Preview or Production.

## Success criteria

- All Expo artwork references resolve to ENDVERA-specific non-starter files at valid dimensions.
- Android foreground, background and monochrome layers pass deterministic asset checks.
- A bilingual five-shot candidate package is reproducible locally.
- Expo Doctor, mobile tests, typecheck, lint and all-platform local export pass.
- External and real-device blockers remain explicit.

