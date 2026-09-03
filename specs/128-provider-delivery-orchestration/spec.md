# Feature Specification: Provider Delivery Orchestration R37F

**Created**: 2026-09-02
**Status**: In progress
**Evidence label**: `SYNTHETIC`; no provider response has been observed.

## Problem

R37C durably orchestrates a sealed synthetic adapter result and R37D strictly
normalizes provider-specific fixtures, but those two contracts are not yet
composed. A later observed provider lane needs one local proof that exact
OpenRouter or Perplexity evidence is normalized before durable recording,
settled for its exact cost and replayed without adapter reinvocation.

## Requirements

- **FR-001**: Compose an R37C controlled run with R37D normalization through an injected fixture adapter only.
- **FR-002**: Persist the canonical provider evidence inside the immutable synthetic evidence snapshot before spend settlement.
- **FR-003**: Parse canonical evidence strictly when returning success or replay.
- **FR-004**: Release the reservation and persist a bounded failure when normalization refuses provider drift.
- **FR-005**: Preserve idempotency, reconnect replay, point-of-use grant checks and zero external transport.
- **FR-006**: Add no credential lookup, network client, public route, consumer or external write.

## Success Criteria

- **SC-001**: Valid OpenRouter and Perplexity fixtures complete with exact canonical evidence and settlement cost.
- **SC-002**: Reconnect replay returns byte-equivalent canonical evidence with zero reinvocation.
- **SC-003**: Invalid fixture drift produces terminal bounded failure and exact spend release.
- **SC-004**: Concurrency creates one controlled run, one spend attempt and one adapter invocation.
