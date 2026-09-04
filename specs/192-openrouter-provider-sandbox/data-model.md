# Data Model: R37 OpenRouter Provider Sandbox

R37 adds no Prisma table or migration. It composes existing durable provider-control entities with new strict in-code contracts.

## Existing durable entities reused

### ProviderLaneControl

Singleton kill switch. Missing means disabled. R37 enables it only around the campaign and disables it in cleanup.

### ProviderActivationGrant

One exact model per grant, allowed case fingerprints, expiry, maximum call count and maximum total spend in integer micro-USD. R37 creates two grants of three calls and 300,000 micro-USD each.

### ProviderSpendAttempt

One reservation per grant/idempotency key. `RESERVED` transitions exactly once to `SETTLED` or `RELEASED`. An existing attempt is evidence that a dispatch may have happened and is never redispatched.

### ProviderActivationDecision

Immutable command/result ledger for lane, grant, reservation, settlement and revocation decisions. It contains fingerprints and bounded metadata, never credential bytes.

## New versioned in-code entities

### R37AuthorityEnvelope

Founder instruction fingerprint, authorized gateway, synthetic-only marker, CAD ceiling, stricter USD ceiling, call ceiling, prohibited effects and evidence expiry.

### R37ModelBinding

Exact model id, input/output list prices, official evidence URL/date, response contract version and maximum output tokens.

### R37ObservedCase

Stable case id/version, ordered synthetic facts with ids, required fact ids, allowed capability keys, expected limitations and per-attempt ceiling.

### R37OpenRouterResponse

Strict provider response view: id, exact model, one text choice, finish reason and usage including decimal cost. Unknown or unbounded content is rejected.

### R37ObservedEvidence

Model/case/request/response fingerprints, bounded normalized answer, cited fact ids, capability, limitations, token usage, upward-rounded micro-USD cost, latency and deterministic oracle result. Evidence label is `OBSERVED_PROVIDER_SYNTHETIC_INPUT`.

### R37CampaignReport

All six expected observation identities, call/spend totals, equality proof, replay count, oracle counts, provider errors, revocation/lane/cleanup state, selected R38 candidate or null, exact verdict and fingerprint.

## State transitions

```text
PLANNED
  -> PREFLIGHT_READY
  -> CREDENTIAL_REQUIRED
  -> RUNNING
      -> ATTEMPT_RESERVED
      -> DISPATCHED_ONCE
      -> RESULT_WRITTEN_LOCALLY
      -> SETTLED | RELEASED
  -> REVOKING
  -> OPENROUTER_SANDBOX_OBSERVED_PASS | REWORK
```

Any process loss after reservation makes that attempt `AMBIGUOUS_PRIOR_DISPATCH`; recovery never sends it again automatically.
