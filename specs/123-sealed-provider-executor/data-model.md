# Data Model: R37A Sealed Provider Executor

No database table is added.

## SealedSandboxAuthorization

Short-lived synthetic-only server input binding R36B campaign, candidate/case
fingerprints, exact model, limits and privacy rules. It has no credential field.

## PreparedProviderRequest

Credential-free method/path/payload audit representation. It is not an HTTP
request and states `dispatchable: false`.

## SyntheticProviderTransport

An injected test function returning bounded JSON, latency, integer microdollar
cost and `externalTransportPerformed: false`.

## SyntheticExecutionEvidence

Stable fingerprints, metrics and failure/success label. It contains no secret
or customer data.

## State transitions

```text
R36B PREPARED_NOT_AUTHORIZED
  -> R37A SEALED_SYNTHETIC_ATTEMPT
  -> SYNTHETIC_LOCAL_RESULT | REFUSED

R37 observed execution
  -> REFUSED: R37A_OBSERVED_PROVIDER_AUTHORITY_REQUIRED
```
