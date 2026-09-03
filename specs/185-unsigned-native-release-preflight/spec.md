# Feature Specification: Unsigned Native Release Preflight

**Status**: Accepted for autonomous implementation

## User Scenarios

### User Story 1 - Verify native release inputs without accounts (P1)

A release owner can prove the iOS and Android identities, icons, permission copy, route parity and signing-disabled profiles locally without Apple, Google or Expo ownership.

### User Story 2 - Understand what this Windows host cannot produce (P1)

The preflight reports that an iOS simulator binary needs macOS and that an Android binary needs a local SDK/JDK or separately authorized build service; it never calls a remote build.

## Requirements

- Canonical app name, scheme, bundle ID, package, versions and icons MUST agree across app config and release definition.
- App metadata and microphone permission rationale MUST support French and English.
- Five primary and all 20 secondary routes MUST remain present.
- Local Android, iOS and Web static exports MUST remain available.
- EAS config MUST contain no submit section, account, project ID, credential value or update channel.
- Historical placeholder asset labels and stale account-deletion path MUST be corrected.
- Missing Android SDK/JDK and Windows iOS limitations MUST be reported, not bypassed.
- No remote build, signing, upload, submission, publication or provider call is allowed.

## Success Criteria

One deterministic validator passes native configuration, assets, localized metadata, routes and boundary assertions and returns exact host limitations.
