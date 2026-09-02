# Contract: Construction Reliability API v1

## Boundary

- Route: `/api/endvera/v1/mobile/reliability`
- Authentication: active ENDVERA user and active Construction membership.
- Cache: `private, no-store`.
- GET requires `workspaceId`; POST accepts one strict command.
- Cross-workspace resources return not found.

## Closed commands

- `SCAN_WORKSPACE`: owner/office; server computes stale cutoff and canonical findings.
- `ACKNOWLEDGE_ALERT`: owner/office; exact alert version and reason code.
- `RESOLVE_ALERT`: owner/office; exact alert version and resolution code.
- `PREPARE_RECOVERY`: owner only; exact alert/item version and one closed action.
- `APPLY_RECOVERY`: owner only; exact recovery version; local-safe apply or quarantine.
- `REVOKE_RECOVERY`: owner only; exact prepared version.
- `CREATE_CHECKPOINT`: owner only; server constructs the closed manifest.
- `RECORD_RESTORE_DRILL`: owner/local operator only; guarded disposable labels and exact manifest comparison.
- `RECORD_GATE_RUN`: local test/operator path only; strict measured fields and `SYNTHETIC` label.

Every command includes schema version 1, UUID command identity and workspace ID.
Unknown fields, dimensions, actions or reason codes refuse.

## Owner/office GET response

- generated time and workspace/role;
- health state `HEALTHY`, `ATTENTION`, `BLOCKED` or `UNKNOWN`;
- metrics with numerator, denominator, window and evidence label;
- open/acknowledged alerts with canonical reference and next responsible role;
- prepared/applied/quarantined recovery actions;
- latest checkpoint, restore drill and gate summary;
- explicit `providerObserved=false` and `externalEffectCount=0`.

## Field-worker GET response

- generated time and exact workspace/role;
- only alerts or interruptions assigned to that member;
- safe project reference, plain next action and status;
- no workspace metrics, traces, connector queue, checkpoint, drill, recovery
  internals, contact coordinates, message body, financial or privacy details.

## Errors

- `400`: malformed or unknown contract input.
- `401`: no authenticated user.
- `404`: missing membership/resource or cross-workspace reference.
- `409`: stale version, idempotency collision, terminal state, unsafe replay,
  non-disposable drill, restore mismatch or failed gate threshold.
- `429`: rate limit.
