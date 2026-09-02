# Contract: Unified Assistant Result

The existing mobile assistant request remains unchanged.

Every successful POST response preserves all existing operational-result fields and adds a provider-neutral `routing` object with: `schemaVersion`, `intentClass`, `capabilityKey`, `disposition`, `readiness`, `citationsRequired`, `approvalRequired`, `providerExecutionAuthorized` and `externalDispatchPerformed`.

## Provider-required behavior

The top-level result uses the existing `UNSUPPORTED` intent and `REFUSED` status for compatibility. The routing projection carries `CANDIDATE_PREPARED` and `PROVIDER_REQUIRED_NOT_AUTHORIZED`. The reply states that no research was executed and no result is claimed.

## Forbidden fields

The response must not contain `selectedRoute`, `routeKey`, `adapterKey`, `modelKey`, provider names, route hashes, policy hashes, fallback route keys or estimated costs.
