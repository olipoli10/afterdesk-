# Open-Loop Closure Contract

## Input command

```json
{
  "schemaVersion": 1,
  "commandId": "stable-idempotency-key",
  "workspaceId": "workspace",
  "projectId": "project",
  "actorId": "authorized-identity",
  "commandType": "REPORT_WORK_FINISHED",
  "source": {
    "kind": "MESSAGE",
    "id": "construction-message-id"
  },
  "claims": {
    "billingBasis": "CHANGE_ORDER",
    "workDescription": "string-or-unknown",
    "amountMinor": 120000,
    "currency": "CAD",
    "completion": true,
    "approvalState": "CLAIMED_APPROVED"
  }
}
```

Unknown values are explicit. Omitted, inferred and verified are different states.

## Evaluation output

```json
{
  "schemaVersion": 1,
  "loopId": "open-loop-id",
  "stateVersion": 3,
  "status": "WAITING_FOR_EVIDENCE",
  "ready": false,
  "missing": ["SUPPORTING_EVIDENCE"],
  "verificationRequired": ["APPROVAL_STATE"],
  "contradictions": [],
  "nextResponsible": {
    "kind": "USER",
    "role": "OFFICE_MANAGER"
  },
  "nextAction": "OBTAIN_WRITTEN_APPROVAL",
  "decisionHash": "lowercase-sha256"
}
```

## Invariants

- Same command ID + same canonical input returns the original effect.
- Same command ID + changed input is a conflict and creates no effect.
- Workspace/project/actor/authority mismatch creates no loop or transition.
- A model cannot supply VERIFIED state.
- No missing requirement or material contradiction can produce `ready=true`.
- Every output reason is from a closed reason-code set.
- Transition, snapshot and audit persistence are atomic.
- R0 accepts only `billingBasis=CHANGE_ORDER`; other bases fail closed until their own policy version exists.
