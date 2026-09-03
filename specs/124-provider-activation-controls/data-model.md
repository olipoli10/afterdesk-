# Data Model: Provider Activation Controls R37B

## ProviderActivationGrant

Workspace, candidate/model binding, R37A fingerprint, status, expiry, call and
microdollar ceilings, reserved/settled counters and optimistic version.

## ProviderSpendAttempt

Idempotency key, grant, case fingerprint, reserved/settled/released amount,
state, version and timestamps. Exactly one terminal transition.

## ProviderLaneControl

Singleton kill-switch state, reason, version and audit timestamps.

## Transitions

```text
GRANT: PREPARED -> ACTIVE -> REVOKED | EXPIRED
ATTEMPT: RESERVED -> SETTLED | RELEASED
LANE: ENABLED <-> DISABLED
```
