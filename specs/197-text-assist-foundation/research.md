# Research — TextAssist foundation

## Decision 1 — Dedicated ENDVERA number, not phone-message surveillance

**Decision**: Receive future SMS through a dedicated ENDVERA number and a provider webhook. The mobile app does not read the owner's SMS history.

**Rationale**: Google Play restricts SMS and call-log permission groups. Broad access normally requires default SMS, phone or assistant-handler status and review. A dedicated number also gives iOS and Android the same product contract.

**Primary source**: Google Play Console Help, “Use of SMS or Call Log permission groups,” accessed 2026-09-05.

**Alternative rejected**: Become the default SMS app in V1. This creates unnecessary store-policy, privacy and UX scope before the core assistant loop is validated.

## Decision 2 — Progressive permissions

**Decision**: Ask for calendar, selected contacts, microphone, notifications and selected files independently and only when the user invokes the related feature.

**Rationale**: Apple requires protected-resource access to be requested case by case with purpose strings; iOS supports limited contact access and narrower calendar access levels.

**Primary sources**: Apple protected-resource, Contacts and EventKit documentation, accessed 2026-09-05.

**Alternative rejected**: “Allow everything” onboarding. It is technically false across both platforms and creates needless denial and trust risk.

## Decision 3 — ENDVERA owns routing and authority

**Decision**: OpenRouter may provide a unified model endpoint and provider/model fallback, but ENDVERA chooses the bounded lane and retains all tool, data, permission, cost and action policy.

**Rationale**: OpenRouter documents provider ordering, fallback, price, latency, throughput, data-collection and ZDR routing. These are useful execution controls, not a substitute for product authorization.

**Primary sources**: OpenRouter Quickstart and Provider Routing documentation, accessed 2026-09-05.

**Alternative rejected**: Send every text to one unconstrained “best model.” This would leak unnecessary context, produce unstable tool authority and make costs and outcomes unauditable.

## Decision 4 — Narrow calendar scopes

**Decision**: Start later with separate read and event-write grants and request the narrowest Google Calendar scope that satisfies the operation.

**Rationale**: Google explicitly recommends the narrowest scopes and distinguishes read-only, event, owned-event and broader calendar scopes. Public apps using sensitive scopes may require verification.

**Primary source**: Google Calendar API authorization scopes, updated 2026-08-27.

## Evidence labels

- Platform constraints: `FACT` from current official documentation.
- Product architecture: `DECISION` based on those constraints and the founder direction.
- Current implementation readiness: `CODE/TEST` only after local validation.
- Provider, customer and production performance: `UNKNOWN` in this release.
