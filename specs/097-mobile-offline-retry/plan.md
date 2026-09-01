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

## Completion gate

- restart restores the same pending command and stable identifier;
- retries cannot produce a second canonical effect;
- workspace switch and sign-out prevent cross-workspace leakage;
- sensitive action payloads are minimized and protected by SecureStore;
- no automatic external send, provider, background transport or customer data;
- no schema, migration, dependency or lockfile change.
