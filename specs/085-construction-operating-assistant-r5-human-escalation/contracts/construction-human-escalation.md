# Construction Human Escalation Contract v1

## Request

`requestConstructionHumanEscalation({ workspaceId, projectId, openLoopId,
purpose, sourceVersion, idempotencyKey, actorId, acceptedClientPriceCents,
acceptedWorkerPayoutCents, acceptedEstimatedMinutes, acceptedCurrency })`

Returns the same `PREPARED` binding under retry. It never dispatches externally.

## Funded activation

`activateFundedConstructionHumanEscalation({ escalationId, workspaceId,
actorId, paymentId })` verifies that the bound task already has an authorized or
received payment covering its frozen price, then activates and locally
publishes the HumanWorkUnit. It never creates or captures a payment.

## Worker packet

Contains only frozen instructions, declared minimum inputs, output schema,
required synthetic/file evidence, acceptance criteria, deadline and revision
count. Financial values, client identity, phone, credentials, AI internals and
unrelated project data are absent from the SQL projection.

## Resume

`applyAcceptedConstructionHumanEscalation(escalationId)` consumes one immutable
acceptance. It returns `applied`, `already_applied`, `not_ready` or a typed
refusal. `recoverPendingConstructionHumanEscalations()` may call it repeatedly.

Exactly-once is enforced by unique database constraints and a single
transaction containing the construction transition, snapshot, audit event and
application marker.
