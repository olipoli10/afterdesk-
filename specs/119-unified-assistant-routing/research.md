# Research: Unified Assistant Routing

## Decision 1 — Integrate before executing

**Decision**: The real assistant boundary calls R36C first; R36C delegates internal work to R9/R2.

**Rationale**: R36A otherwise remains unused infrastructure. Delegating preserves the proven operational engine and avoids a second SMS/calendar engine.

**Alternatives considered**: Classify after R9 execution (unsafe because writes could precede policy); replace R9/R2 (unnecessary rewrite); expose a separate research endpoint (fragments the assistant experience).

## Decision 2 — Trusted server defaults

**Decision**: Mobile clients supply only the existing request fields. R36C derives channel and safety/economic policy server-side.

**Rationale**: Data class, privacy, risk and budget are authorization inputs and cannot be trusted from a client.

**Alternatives considered**: Expand the public request contract (privilege escalation risk); infer every field solely from language (can only strengthen, not establish the baseline).

## Decision 3 — Honest durable deferral

**Decision**: Candidate-prepared routing creates a durable exchange that says external execution is not authorized and returns no claimed answer.

**Rationale**: The conversation should remember the request, but a routing plan is not provider output. Persistence also supplies replay and restart behavior.

**Alternatives considered**: Ephemeral refusal (loses operational memory); run the old unsupported interpreter (persists misleading generic text); synthetic answer (false evidence).

## Decision 4 — Minimal provider-neutral projection

**Decision**: Clients see capability, disposition, readiness, citation and approval requirements, plus false external-effect flags.

**Rationale**: The customer cares what ENDVERA can do next, not which provider/model the internal policy considered.

**Alternatives considered**: Expose selected route/model (violates product positioning and leaks policy); expose only a string (not machine-checkable).

## Decision 5 — Existing message storage, no migration

**Decision**: Deferred exchanges use existing `ConstructionMessage` inbound/outbound rows and existing workspace uniqueness.

**Rationale**: The data model already represents durable conversation and provides history projection. No new durable state is required.

**Alternatives considered**: New routing table (unnecessary schema and migration); in-memory replay map (lost on restart).

## Decision 6 — Installed framework rules

**Decision**: Retain the installed Next.js 16 route-handler pattern using standard `Request` JSON parsing and `NextResponse`.

**Rationale**: Installed documentation confirms route handlers use Web Request/Response APIs and POST is not cached.

**Alternatives considered**: Server action or pages API conversion (unnecessary and riskier).
