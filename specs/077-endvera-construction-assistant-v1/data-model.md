# Data Model

## ConstructionWorkspace

Company boundary with owner, locale, timezone and active status. Membership remains explicit.

## ConstructionWorkspaceMember

Links authenticated users to a workspace with OWNER/ADMIN/MEMBER role and ACTIVE/REVOKED status.

## ConstructionCommunicationIdentity

Verified inbound identity scoped to one workspace and optionally one user/contact. Stores normalized synthetic address and closed permission set.

## ConstructionProject

Workspace-scoped job with unique code, name, address, timezone and lifecycle status.

## ConstructionContact

Workspace contact optionally scoped to one project. It is not an authenticated user.

## ConstructionMessage

Immutable inbound/outbound message envelope with direction, channel, simulator/provider event identity, idempotency key, body, association and processing state.

## ConstructionInterpretation

One validated closed intent per message, including confidence, original date phrase, candidate identifiers, clarification and proposed payload.

## ConstructionCalendarItem

Canonical project/contact event with UTC times, display timezone, verification state and source message.

## ConstructionAction

Operational action or outbound draft. Exact payload hash and version bind approval. Simulated delivery count is at most one.

## ConstructionAuditEvent

Append-only, workspace-scoped evidence of admission, refusal, interpretation, mutation, approval and simulated delivery.

## Critical invariants

- no child row without workspace ownership;
- membership rechecked per operation;
- provider + providerMessageId unique when present;
- message idempotency key unique per workspace;
- one interpretation per message;
- one calendar event per source message;
- action version and payload hash change together;
- simulated delivery count is 0 or 1;
- audit is written in the same transaction as canonical mutation.
