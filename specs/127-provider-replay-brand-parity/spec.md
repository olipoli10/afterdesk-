# Feature Specification: Provider Replay Brand Parity R37E

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`
**Created**: 2026-09-02
**Status**: In progress
**Evidence label**: `CODE + TEST + DISPOSABLE_POSTGRESQL`; no provider response is involved.

## Problem

The synthetic provider replay harness recognizes legacy AfterDesk classifier and
planner prompts, but the real work engine now identifies itself as Endvera.
Consequently, a credential-free integration run routes a valid classification
request to `other`, stops before persisting classification or plan evidence and
creates false failures in downstream budget assertions.

## Requirements

- **FR-001**: Recognize current Endvera classifier and planner system prompts by their exact stable role phrases.
- **FR-002**: Preserve legacy AfterDesk recognition for historical fixtures.
- **FR-003**: Preserve fail-closed `other` routing for unknown prompts.
- **FR-004**: Add no provider, credential, network, product runtime or external-write path.
- **FR-005**: Prove the originally failing budget-demotion workflow against disposable PostgreSQL.

## Success Criteria

- **SC-001**: Endvera and AfterDesk classifier/planner stage pins pass.
- **SC-002**: Provider replay and synthetic responder regression tests pass.
- **SC-003**: The exact budget-demotion integration passes 6/6.
- **SC-004**: Typecheck, targeted lint and `git diff --check` pass.

## Exclusions

No production code, provider call, credential, customer data, transport,
external write, spend, push, Preview, Production or deployment.
