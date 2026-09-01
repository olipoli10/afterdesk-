# Research: R9 Mobile Assistant

## Decision 1 — Reuse the deterministic persistent core

**Decision**: Delegate mobile messages to `processOperatingAssistantCommand`.

**Rationale**: It already owns PostgreSQL persistence, interpretation, idempotency, calendar/reminder behavior, prepared outbound actions and audit. A second mobile chat engine would split truth and duplicate safety logic.

**Rejected**: Mobile-only interpreter; external model/provider; new chat tables.

## Decision 2 — Derive the portal actor on the server

**Decision**: The mobile contract omits channel and sender. The server fixes the channel to portal and sender to the authenticated user.

**Rationale**: The client has no legitimate reason to choose an identity. This removes an impersonation surface while preserving the provider-neutral core contract internally.

## Decision 3 — Restrict R9 to owner/office manager

**Decision**: Field-worker assistant access is refused in R9.

**Rationale**: The existing conversational core can return operational and financial context that does not yet have a field-safe per-intent projection. Refusal is safer than UI-only hiding.

## Decision 4 — Persist history only on the server

**Decision**: The native app keeps current history in memory and reloads it from PostgreSQL.

**Rationale**: It avoids an unencrypted operational-message cache and prevents stale conversation from masquerading as current state.

## Decision 5 — Exact retry after uncertain transport

**Decision**: A retry reuses the complete original request, including UUID and timestamp.

**Rationale**: The core idempotency key includes the command identifier. A new ID would turn recovery into a new command.
