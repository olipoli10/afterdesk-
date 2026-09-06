# Implementation Plan: Founder self live activation

## Technical Context

- Mobile: Expo SDK 57 / React Native 0.86, one app for iOS and Android.
- Native protected resources: device contacts and device calendars through Expo config plugins and runtime permission APIs.
- Backend: existing TypeScript/Next.js server and provider-neutral prepared-action state machines.
- Communications: dedicated provider-hosted number; Twilio is the first candidate, behind server-only capability gates.
- Calendar: native-device access for the first self install; existing Google Calendar OAuth contract remains the direct-cloud path.
- Distribution: EAS internal physical-device profiles first, store candidates later.

## Constitution Check

- Closed-world capabilities: PASS; SMS, voice, contacts and calendar are explicit, gated capabilities.
- Authorization/privacy: PASS; permissions are progressive and SMS/call-log surveillance remains forbidden.
- External writes: PASS; local implementation cannot dispatch and live activation requires exact approval plus verification.
- Evidence honesty: PASS; code readiness, install readiness, provider readiness and observed live evidence remain separate.
- Complexity: PASS; the shared mobile app and existing connector boundaries are extended rather than rewritten.

## Phase 0 — Research decisions

See [research.md](research.md). All implementation choices and current platform constraints are resolved.

## Phase 1 — Design

- Add physical internal build profiles without credentials or submission configuration.
- Add native contacts/calendar permission declarations and a one-screen activation centre.
- Add a value-free activation readiness manifest with exact external inputs.
- Extend server capability gates for SMS and voice without adding a network executor.
- Validate configuration, secret absence, permission behaviour and claim boundaries.

## Rollout and rollback

- Rollout: local code validation, signed internal founder build, dedicated-number provisioning, bounded self pilot, then separate store review.
- Rollback: revoke native permissions, disable capability gates, revoke provider credentials/number routing and uninstall the internal build.
- No live transport is enabled by this implementation slice.
