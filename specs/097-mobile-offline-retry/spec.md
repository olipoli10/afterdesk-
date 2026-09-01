# Feature Specification: Mobile Offline-Safe Command Recovery

## Problem, Evidence, and Scope

**CODE — denominator**: This feature applies to the four bounded structured
mobile command families supported on 2026-09-01: operating commands, assistant
requests, prepared-action decisions, and local permission revocations.

**INFERRED — problem**: A mobile process or connection can stop after a user
acts but before the client knows the canonical result. Losing the exact command
or generating a new identifier on retry can create ambiguity or a duplicate
attempt.

**UNKNOWN — demand and economics**: Customer frequency, willingness to pay,
feature-level price, retention effect, and contribution-margin effect have not
been measured. R17 is selected as a reliability prerequisite, not as evidence
of market demand. It authorizes zero provider or human spend, so its external
execution cost ceiling is exactly zero.

**Explicit exclusions**: file uploads, background execution, provider access,
external transport, customer data, connector credentials, deployment, EAS, and
store publication are outside R17.

## User Scenarios & Testing

### User Story 1 — Recover an interrupted command (Priority: P1)

As an authenticated ENDVERA user, I can reopen the mobile app after losing
connectivity or closing it during a command and see the same command awaiting a
clear decision, without ENDVERA silently repeating the action.

**Independent test**: Start a command, interrupt it before its result is known,
restart the app, and verify that the same stable command is shown as outcome
unknown with an explicit retry or discard choice.

**Acceptance scenarios**:

1. **Given** a command was in progress when the app stopped, **when** the same
   user reopens the same workspace, **then** the command is restored with the
   same stable identifier and an outcome-unknown state.
2. **Given** a restored command, **when** the user takes no action, **then** no
   retry or external action occurs automatically.

### User Story 2 — Retry without duplicate effects (Priority: P1)

As an authenticated ENDVERA user, I can explicitly retry a recoverable command
and know that the original stable identifier is reused so the canonical system
cannot apply the same intent twice.

**Independent test**: Retry the same restored command more than once and verify
that the command produces at most one canonical effect and visibly resolves as
confirmed, replayed, conflicted, refused, or still outcome unknown.

**Acceptance scenarios**:

1. **Given** an outcome-unknown command, **when** the user chooses retry,
   **then** ENDVERA reuses the original command and stable identifier.
2. **Given** the canonical effect already exists, **when** the same command is
   retried, **then** ENDVERA reports a replay rather than creating a second
   effect.

### User Story 3 — Keep recovery private to the current account (Priority: P2)

As an ENDVERA user, I never see another workspace's pending commands, and
signing out removes the locally retained recovery state from the device.

**Independent test**: Queue commands in two workspaces, switch workspaces, then
sign out and verify that each workspace shows only its own commands and that a
later session cannot load the former user's outbox.

**Acceptance scenarios**:

1. **Given** commands from multiple workspaces, **when** a workspace is active,
   **then** only commands belonging to that workspace are shown.
2. **Given** retained recovery entries, **when** the user signs out, **then** all
   retained entries are removed before the session ends.

## Edge Cases

- The retained command is malformed, corrupt, or from an unsupported version.
- A command is larger than the bounded local storage policy.
- Local protected storage is unavailable.
- The account changes while a command result remains unknown.
- The user attempts to retry a terminal confirmed, replayed, conflicted, or
  refused command.
- Two writes use the same stable identifier with different command content.

## Requirements

### Functional Requirements

- **FR-001**: ENDVERA MUST retain recoverable mobile commands with their original
  stable identifiers before attempting them.
- **FR-002**: ENDVERA MUST restore an interrupted in-progress command as outcome
  unknown after an app restart.
- **FR-003**: ENDVERA MUST NOT retry, dispatch, or execute a retained command
  without an explicit user action.
- **FR-004**: An explicit retry MUST reuse the exact original command and stable
  identifier.
- **FR-005**: ENDVERA MUST distinguish queued, sending, confirmed, replayed,
  conflicted, refused, and outcome-unknown states.
- **FR-006**: ENDVERA MUST reject reuse of a stable identifier for different
  command content.
- **FR-007**: ENDVERA MUST limit retained entries and retained content size.
- **FR-008**: ENDVERA MUST retain only the command metadata required for exact
  recovery and MUST NOT display sensitive command bodies in the recovery list.
- **FR-009**: ENDVERA MUST isolate recovery entries by workspace.
- **FR-010**: ENDVERA MUST clear all retained recovery entries before signing
  out.
- **FR-011**: ENDVERA MUST fail closed when protected local storage is corrupt or
  unavailable.
- **FR-012**: ENDVERA MUST permit an explicit discard of a retained entry without
  changing canonical server state.
- **FR-013**: This feature MUST NOT add background delivery, provider access,
  customer data, external transport, or automatic external sending.

### Key Entities

- **Recovery entry**: A bounded retained command identified by its original
  stable identifier, workspace, type, state, timestamps, and exact retry data.
- **Recovery state**: The user's current knowledge of whether an action is
  queued, in progress, complete, replayed, conflicted, refused, or unknown.

## Assumptions

- The user is already authenticated and the canonical server endpoints retain
  their existing idempotency protections.
- Only commands that can be reproduced exactly from bounded structured data are
  retained; local file uploads are excluded from R17.
- Recovery is foreground-only and always initiated by the user.

## Authorization, Data, and Failure Model

- The signed-in account and active workspace projection authorize visibility;
  a retained entry from another workspace is refused rather than filtered into
  the active list.
- Retained command data is `INTERNAL_SENSITIVE`: it stays in protected device
  storage, is bounded, is never printed in the recovery surface, and is cleared
  before sign-out.
- Corruption, unsupported versions, unavailable protected storage, identifier
  drift, terminal retry, oversized entries, and workspace mismatch fail closed.
- Canonical server idempotency remains authoritative. The outbox preserves the
  command required to exercise that existing protection; it does not invent a
  second client-side canonical result.

## Verification, Observability, Delivery, and Rollback

- **TEST**: bounded-storage, crash recovery, exact re-enqueue, workspace
  isolation, clearing, corruption, drift, terminal retry, and discard behavior
  are verified with automated local tests.
- **CODE**: each retained entry records a version, stable identifier, workspace,
  command family, state, created time, updated time, and public failure reason.
- Delivery requires all R17 tests, mobile lint/typecheck, Doctor, local
  iOS/Android/Web export, unchanged lockfiles, and no forbidden authority use.
- Rollback is removal of the recovery route and session wiring plus clearing the
  versioned protected outbox keys. Canonical server state is untouched, so R17
  introduces no data migration or historical reinterpretation.
- Rollout remains local-only until a separately authorized device or provider
  campaign exists. No readiness claim advances from this feature alone.

## Success Criteria

- **SC-001**: 100% of interrupted commands in the supported set reappear after a
  restart with the same stable identifier.
- **SC-002**: Repeated retries of one stable command create zero duplicate
  canonical effects.
- **SC-003**: Zero retained commands are automatically retried or externally
  delivered.
- **SC-004**: Workspace switching and sign-out expose zero commands from another
  workspace or previous signed-in account.
- **SC-005**: Every supported recovery state is presented with one clear next
  action or a clear terminal outcome.
