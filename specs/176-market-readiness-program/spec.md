# Feature Specification: R36G-R36K Market Readiness Program

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`  
**Created**: 2026-09-03  
**Status**: Ready for implementation  
**Input**: Founder authorization to continue all useful local preparation for ENDVERA Web, iOS and Android without routine confirmation.

## Product outcome

ENDVERA has one inspectable local market-readiness path for Web, iOS and Android. It prepares production-shaped build contracts, store compliance material, public-site configuration, operational monitoring and an exact release gate while keeping signing, credentials, provider calls, deployment, store submission and publication impossible under this authority.

This program closes the gap between `LOCAL_PACKAGE_READY` and `READY_FOR_EXTERNAL_AUTHORITY`. It does not claim that a signed binary exists, that any store reviewed the app, that a public deployment exists, or that a provider/customer lifecycle was observed.

## Releases

### R36G — Signable mobile build preparation

Create one credential-free EAS build contract beside the Expo application, freeze iOS/Android identities and version sources, declare production artifact formats, list every signing input by reference only, and validate that no submit profile, credential value, project identifier or external command is present.

### R36H — Public Web production preparation

Create a value-free production environment contract and a deterministic Web release inventory covering the public site, authentication callbacks, legal/support routes, health, rollback and canonical API origin. No public origin is selected and no deployment runs.

### R36I — Store compliance and listing pack

Complete the local Apple/Google submission workbook: bilingual listing copy, privacy/data-safety answers, permission explanations, account-deletion/support paths, age/content declarations, screenshot shot list and asset acceptance rules. Unknown legal/account answers remain explicit blockers.

### R36J — Release observability and support

Define production-shaped health signals, redacted error events, incident severities, support ownership, rollback triggers and evidence retention. External monitoring adapters remain disabled and contain no endpoint or secret.

### R36K — Unified market-readiness gate

Produce one deterministic command and one machine-readable report that evaluates Web, iOS and Android separately, distinguishes locally complete work from external-authority blockers, and refuses any inflated `storeReady`, `deployed`, `published`, `providerObserved` or `productionReady` claim.

## User scenarios and acceptance

### US1 — Prepare store-shaped mobile builds without external action (P1)

An operator can inspect the exact iOS archive and Android App Bundle profiles, identities and version policy. The validator accepts only value-free, credential-free configuration and refuses submission automation, embedded credentials, an Expo project owner/id, remote update channels or automatic store upload.

### US2 — Know whether the public Web surface is deployable (P1)

An operator sees every required environment variable name, public route, callback, operational check and rollback prerequisite without seeing or serializing secret values. Missing external ownership remains a blocker rather than being guessed.

### US3 — Complete Apple and Google questionnaires consistently (P1)

The same canonical capability/privacy inventory drives both store packs. Permission copy matches runtime configuration. Unsupported tracking, provider, customer-proof, store-availability or legal-review claims fail validation.

### US4 — Operate and recover a later authorized release (P1)

The release package names the observable symptoms, alert owner, safe first response, rollback threshold and evidence required for a later authorized production incident. No real monitoring transport is configured.

### US5 — Receive one honest release decision (P1)

The unified report returns `LOCAL_MARKET_PREPARATION_COMPLETE` only when all five local releases pass. It continues to return `EXTERNAL_AUTHORITY_REQUIRED` for signing, accounts, public deployment, provider/customer testing and store submission until those events are genuinely observed.

## Functional requirements

- **FR-001**: The mobile build contract MUST live at `apps/mobile/eas.json`, use explicit named profiles and contain no `submit` section.
- **FR-002**: The mobile build contract MUST use the existing `ai.endvera.mobile` iOS bundle identifier and Android package and MUST NOT invent Expo, Apple or Google account identifiers.
- **FR-003**: Production-shaped mobile profiles MUST declare Android App Bundle output and iOS store distribution intent without initiating a build.
- **FR-004**: All generated readiness artifacts MUST contain variable names or credential reference codes only, never values.
- **FR-005**: Web, Apple and Google readiness MUST be evaluated independently.
- **FR-006**: Every unresolved external prerequisite MUST have an owner class, required evidence and blocking target.
- **FR-007**: App permission declarations MUST match the actual Expo configuration and canonical privacy disclosure.
- **FR-008**: A mismatch in identity, version, permission, capability, locale, route, readiness claim or source hash MUST fail closed.
- **FR-009**: Local validation MUST execute no child process, network request, signing, upload, submission, deployment or provider call.
- **FR-010**: The program MUST preserve `signed=false`, `uploaded=false`, `published=false`, `deployed=false`, `providerObserved=false` and `externalEffectCount=0` until separately observed.
- **FR-011**: The unified report MUST distinguish `CODE`, `TEST`, `SYNTHETIC`, `OBSERVED`, `INFERRED` and `UNKNOWN` evidence.
- **FR-012**: R37 provider sandbox MUST remain blocked behind R36K and exact external authority.

## Success criteria

- **SC-001**: One local command validates the mobile build contract and returns zero external effects.
- **SC-002**: iOS and Android identities and versions match `apps/mobile/app.json` exactly.
- **SC-003**: Every current submission gap is either locally closed with evidence or retained as a named external blocker.
- **SC-004**: The final market-readiness report is byte-stable for identical inputs.
- **SC-005**: Mutating one protected identity, permission, route, boundary flag or hash produces a specific refusal.
- **SC-006**: No dependency or lockfile changes are required.

## Explicit exclusions

- Apple Developer, App Store Connect, Google Play Console or Expo account access.
- Signing certificates, provisioning profiles, keystores or credentials.
- EAS build, submit, update or workflow execution.
- Vercel/other deployment, DNS or public origin changes.
- Provider calls, real communications, customer/prospect data or external monitoring.
- Store screenshots presented as real-device evidence before they are captured.
- Legal approval, store approval, production readiness, PMF or willingness-to-pay claims.

## Evidence labels

All output in R36G-R36K is `CODE`, `TEST` or `SYNTHETIC`. `OBSERVED` remains unavailable for signing, stores, deployment, providers and customers.
