# Feature Specification: Secretary broadcast exact approval

**Created**: 2026-09-05
**Status**: Implementation

## User story

An authorized owner or admin inspects the frozen recipients, SMS channel and
exact text, then explicitly approves that exact version. The draft becomes
`APPROVED_UNSENT`; no provider or dispatch path is created.

## Requirements

- Approval MUST bind the workspace, draft id, version and payload fingerprint.
- The approval statement MUST be explicit and affirmative.
- Identical replay MUST reconstruct the same result.
- A changed replay or any second approval command MUST be refused visibly.
- Field workers and cross-workspace actors MUST be refused.
- The approved record MUST retain the exact approved version and fingerprint.
- External transport MUST remain false.

## Success criteria

- One owner/admin approval creates one audit event and one state transition.
- Exact replay creates no additional mutation.
- Stale fingerprint, stale version and second approval are refused.
- Restart projection remains `APPROVED_UNSENT`.
- Provider calls and external transport remain zero.
