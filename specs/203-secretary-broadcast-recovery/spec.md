# Feature Specification: Secretary broadcast mobile recovery

**Created**: 2026-09-05
**Status**: Planned

## User story

An owner approves one exact group text from a phone. If the phone is offline or
the response is interrupted, ENDVERA retains the same command and later
reconciles it without creating a second approval.

## Requirements

- Store the exact approval command before dispatch.
- Preserve its command id, draft id, version and payload hash across restart.
- Classify offline, conflict and outcome-unknown states visibly.
- Retry only the same frozen command.
- Reconcile `APPROVED_UNSENT` before presenting failure after uncertainty.
- Never add provider or SMS transport authority.

## Success criteria

- Offline approval remains pending and recoverable.
- Outcome-unknown recovery does not create a second approval.
- A confirmed or replayed approval leaves no pending command.
- Cross-workspace and changed-payload recovery are refused.
- External transport remains zero.
