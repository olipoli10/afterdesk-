# Research and Design Decisions

## Decision 1 — Closed action registry

The policy engine evaluates only registered action definitions. Free-form
action names would let callers bypass risk metadata and would contradict the
constitution's closed-world capability rule.

## Decision 2 — Three user-facing authority outcomes

`AUTOMATIC_INTERNAL`, `APPROVAL_REQUIRED` and `PROHIBITED` are sufficient for
the first policy engine. Execution state remains separate. Approval means the
local action is authorized to advance; it does not claim provider delivery.

## Decision 3 — Strictest applicable rule wins

Rules can overlap by workspace, project, action, role, data class and amount.
Choosing the strictest applicable result is deterministic and fail closed. A
more permissive narrow rule cannot weaken a mandatory registry guard.

## Decision 4 — Immutable policy versions

Activation freezes the complete policy set. Any change creates a new draft and
activation supersedes the prior version atomically. Historical evaluations
therefore retain the exact authority contract used at the time.

## Decision 5 — Policy is not role authorization

R16 role capability and resource ownership are evaluated before workspace
policy. Policy may further restrict a role, but cannot grant a role capability
the canonical role model denies.

## Decision 6 — External effects remain outside R28

R28 creates authority evidence only. Connector engines still keep provider and
external-effect gates disabled. This isolates policy correctness from later
provider authority and prevents an approval record from becoming a dispatch.

## Evidence label

These are design decisions for local implementation (`INFERRED`). Their unit
and disposable-PostgreSQL verification will be `TEST`; no customer, provider or
production behaviour is established.
