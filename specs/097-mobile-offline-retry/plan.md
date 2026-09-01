# R17 Plan — Offline-Safe Mobile Outbox and Recovery

## Objective

Make mobile commands survive loss of connectivity and app restart without
duplicating canonical effects. The user sees what is pending, what is safe to
retry and what needs a fresh decision.

## Allowed implementation

- reuse Expo SecureStore for a bounded, versioned local command outbox;
- persist only minimum command metadata required for exact retry;
- preserve stable idempotency keys across app restart;
- distinguish queued, sending, confirmed, replayed, conflict, refused and
  outcome-unknown states;
- add recovery and explicit discard controls without background provider work;
- add unit and local export proof.

## Architecture and boundaries

- the mobile app retains a versioned bounded entry in protected device storage
  before foreground dispatch;
- the canonical server remains the authority for authorization, tenancy,
  idempotency and final effects;
- app restart may demote only `SENDING` to `OUTCOME_UNKNOWN`; it never promotes
  an unknown result to success;
- the recovery list projects metadata and state, never the retained command
  body;
- clearing protected keys is a precondition of sign-out;
- no database, server contract, connector, background task or new dependency is
  introduced.

## Rollout and rollback

- rollout is local export proof only, with no customer or provider activation;
- rollback removes the route and session integration, then clears the versioned
  protected keys; canonical server records require no rollback;
- readiness, roadmap and Verified-E2E metrics do not advance from R17 alone.

## Completion gate

- restart restores the same pending command and stable identifier;
- retries cannot produce a second canonical effect;
- workspace switch and sign-out prevent cross-workspace leakage;
- sensitive action payloads are minimized and protected by SecureStore;
- no automatic external send, provider, background transport or customer data;
- no schema, migration, dependency or lockfile change.
