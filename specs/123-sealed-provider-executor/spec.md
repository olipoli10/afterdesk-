# Feature Specification: ENDVERA Sealed Provider Executor R37A

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: Local implementation

## Problem Statement

R36B prepares provider candidates but cannot safely bridge a prepared request
to a future authorized observation. R37A adds a local-only sealed executor:
an injected synthetic adapter can be tested, while any real provider dispatch
remains impossible.

## User Scenarios & Testing

### User Story 1 — Safe future provider preparation (Priority: P1)

An operator seals a current synthetic R36B case with a candidate, exact model
identifier, privacy rules, a cost ceiling and an expiry without a credential.

**Independent Test**: Unknown candidate, direct-controller, fingerprint
mismatch, expiry, altered privacy or excess budget refuse before transport.

### User Story 2 — Truthful local simulated observation (Priority: P1)

The server runs only an injected synthetic adapter and records bounded evidence
that it was synthetic and that no external dispatch occurred.

**Independent Test**: Valid bounded synthetic output passes; malformed, excess
or external-marked output refuses and is never called observed or certified.

### User Story 3 — Future activation cannot bypass the seal (Priority: P1)

There is no HTTP route, runtime consumer, environment-secret read, persistent
credential field or automatic dispatch path.

**Independent Test**: Serialization excludes secrets; observed mode refuses
with an explicit authority-required error.

## Functional Requirements

- **FR-001**: Seal only a current R36B campaign, candidate and synthetic case.
- **FR-002**: Bind candidate/case fingerprints, exact model where applicable,
  call/spend limits, privacy policy, authorization time and expiry.
- **FR-003**: Invalid, expired, altered, unbound, non-synthetic or over-budget
  input refuses before synthetic transport invocation.
- **FR-004**: No credential is read, stored, accepted, returned or logged.
- **FR-005**: OpenRouter request form retains explicit model, no fallback,
  `data_collection: deny` and ZDR. Research remains separate.
- **FR-006**: Direct controller stays unbound and refuses.
- **FR-007**: A local adapter must explicitly report
  `externalTransportPerformed: false`; outcomes are `SYNTHETIC` only.
- **FR-008**: Malformed, over-latency, over-cost, oversized or privacy-invalid
  output refuses.
- **FR-009**: No public endpoint, migration, dependency, lockfile edit,
  provider call, automatic consumer or external write is added.
- **FR-010**: R36C disabled assistant behavior remains unchanged.

## Authorization and Explicit Exclusions

R37A authorizes local source, tests and commits only. It prohibits provider
accounts, credentials, network, spend, customer/prospect data, SMS, email,
voice, OAuth, push, Preview, Production and deployment. A future observed R37
needs separate explicit authority, restricted runtime credentials and current
model/price/privacy evidence.

## Success Criteria

- **SC-001**: 100% of invalid seals refuse before transport.
- **SC-002**: Serialized records exclude credentials and raw client state.
- **SC-003**: Successful local outcomes say `SYNTHETIC` and
  `externalDispatchPerformed: false`.
- **SC-004**: Invalid synthetic results fail closed.
- **SC-005**: R36C disabled-state regression remains green.
