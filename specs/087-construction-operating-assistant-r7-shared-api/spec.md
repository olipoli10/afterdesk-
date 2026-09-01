# ENDVERA Construction Operating Assistant R7 — Shared application API

## Outcome

The web portal and future iOS/Android clients can use one versioned, authenticated
construction API instead of duplicating business logic. The API accepts bounded
operational commands and returns a role-shaped cockpit built from canonical
PostgreSQL state.

## Requirements

- the authenticated account, never request JSON, supplies the actor identity;
- every request and response is schema-versioned and strict;
- commands reuse R6 idempotency, authorization and audit behavior;
- the cockpit derives its role from active workspace membership;
- owner/admin projections include receivables and prepared-action details;
- field-worker projections omit money, invoice references, message bodies and
  action payloads;
- malformed JSON, oversized payloads, stale commands and cross-workspace access
  fail without exposing internal errors;
- no command executes a connector, provider, SMS, email, call or payment.

## Non-goals

Mobile authentication, an iOS or Android binary, push notifications, offline
write synchronization, live connectors, customer data, deployment and external
transport are not part of R7.

## Success

One shared gateway creates/replays a receivable, records payment and schedules a
follow-up. One cockpit response supports web/mobile rendering while proving
that a field worker cannot retrieve financial or communication payload data.
