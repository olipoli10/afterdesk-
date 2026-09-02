# Research: R36A AI Routing Brain

## Decision 1 — Reuse the existing Model Gateway

**Decision**: Build an assistant-routing facade over the existing registry,
privacy, policy, budget, fallback, evidence and breaker concepts.

**Rationale**: The repository already contains a server-only Model Gateway with
versioned policies, exact route profiles, cost holds, dispatch knowledge, privacy
evidence, fallback and audit. A second engine would create conflicting authority.

**Alternatives considered**: Direct calls from the SMS handler; an OpenRouter-only
router; a new standalone agent framework. All were rejected because they bypass
closed policy or create vendor lock-in.

## Decision 2 — “Best” means best eligible under a versioned policy

**Decision**: The internal brain selects the first eligible version-pinned route
whose evidence, privacy, budget, availability and risk constraints pass.

**Rationale**: No model is universally best, and provider quality/pricing changes.
The system needs reproducible decisions, not a marketing claim.

**Alternatives considered**: Hard-code one frontier model; dynamically choose from
provider marketing metadata. Both were rejected as unauditable.

## Decision 3 — Specialized research is a capability, not general browsing

**Decision**: Public professional research requires citations, personal-data
privacy when a person is named, and refusal for restricted private information.

**Rationale**: This gives contractors useful supplier/company research without
turning the product into a doxxing or unsourced enrichment tool.

## Decision 4 — OpenRouter and Perplexity remain candidates

**Decision**: Represent them only as candidate route families in R36A.

**Rationale**: Exact current APIs, pricing, retention, residency and sandbox
behavior are time-sensitive and require fresh official evidence under R37.

