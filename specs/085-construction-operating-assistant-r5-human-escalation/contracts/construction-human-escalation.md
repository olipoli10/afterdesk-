# Construction Human Escalation Contract v1

## Request

`requestConstructionHumanEscalation({ workspaceId, projectId, openLoopId,
purpose, sourceVersion, idempotencyKey, actorId })`

Returns `created`, `existing` or a typed refusal. It never dispatches externally.

## Worker packet

Contains only frozen instructions, declared minimum inputs, output schema,
required synthetic/file evidence, acceptance criteria, deadline and revision
count. Financial values, client identity, phone, credentials, AI internals and
unrelated project data are absent from the SQL projection.

## Resume

`applyAcceptedConstructionHumanResult(escalationId)` consumes one immutable
acceptance. It returns `applied`, `already_applied`, `not_ready` or a typed
refusal. `recoverPendingConstructionHumanResults()` may call it repeatedly.

Exactly-once is enforced by unique database constraints and a single
transaction containing the construction transition, snapshot, audit event and
application marker.
