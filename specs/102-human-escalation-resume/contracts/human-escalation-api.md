# R22 Mobile Human Escalation Contract

All payloads are strict and versioned. Unknown keys are refused. Authentication, workspace membership, role, resource binding, and state are rechecked on every operation.

## GET `/api/endvera/v1/mobile/human-escalations?workspaceId=...`

Returns the authorized owner/office projection with escalation, project, open loop, purpose, evidence kind, owner-facing state, next responsible role, next action, deadline, remaining revisions, source version, client price/currency, acceptance provenance, application time, and `externalTransportPerformed: false`.

Field-worker or unauthorized membership is refused rather than receiving the owner projection.

## POST `/api/endvera/v1/mobile/human-escalations`

### Prepare

Required strict fields:

- `schemaVersion: 1`
- `command: "PREPARE"`
- stable `requestId` and `idempotencyKey`
- `workspaceId`, `projectId`, `openLoopId`, and `expectedStateVersion`
- `purpose: "OBTAIN_MISSING_EVIDENCE"`
- `evidenceKind: "WRITTEN_APPROVAL" | "PHOTO" | "DOCUMENT"`
- positive integer `acceptedClientPriceCents`, `acceptedWorkerPayoutCents`, and `acceptedEstimatedMinutes`
- `acceptedCurrency: "CAD"`

Response returns the canonical escalation, state, replay flag, funding requirement, and zero-transport proof.

### Withdraw

Required strict fields:

- `schemaVersion: 1`
- `command: "WITHDRAW"`
- stable `requestId` and `idempotencyKey`
- `workspaceId`, `escalationId`, and bounded `reason`

Withdrawal is idempotent and cannot erase submissions, decisions, or transitions.

### Runtime boundary

- No mobile command activates funding, captures payment, publishes externally, assigns a worker, reviews a result, or forces resume.
- Activation, worker claim/submission, independent review, and recovery reuse existing canonical server paths under their own authority.
- Product responses never expose worker payout, raw phone numbers, credentials, or unrelated tenant data.

## Error families

- `ACCESS_DENIED`
- `STALE_STATE_VERSION`
- `IDEMPOTENCY_CONFLICT`
- `HUMAN_ESCALATION_DISABLED`
- `LOOP_NOT_ELIGIBLE`
- `FUNDING_REQUIRED`
- `INVALID_CONTRACT`
- `INVALID_EVIDENCE`
- `RESUME_REFUSED`
- `CONCURRENT_STATE_CHANGE`

Errors are stable, non-secret, and do not reveal whether another tenant's resource exists.
