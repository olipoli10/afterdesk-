# Data Model: Provider Sandbox Preflight R36B

R36B is a pure local contract layer. These logical entities add no database table.

## ProviderCandidatePacket

Stable key/version; closed capability and endpoint family; data classes; privacy invariants; integer microdollar ceiling; output/verification contract; dated official evidence and expiry; candidate-only flags; canonical fingerprint.

## SandboxCase

Stable case/version; synthetic marker; intent, locale, region and ordered bounded facts; data class; output contract; equal latency/token/result/cost ceilings; input fingerprint.

## ProviderRequestPlan

Stable plan/version; packet/case fingerprints; endpoint family; credential reference name only; bounded provider-neutral and inert provider-specific parameters; non-dispatchable flags; plan fingerprint.

## NormalizedSourceEvidence

Bounded title, direct URL, snippet, optional source date and fingerprint. No contact coordinate or private-person field.

## CandidateObservation

Candidate/case/fixture fingerprints; `SYNTHETIC` evidence; integer latency/cost; contract validity; citation coverage; unsupported-claim count; failure class; normalized-output fingerprint. No raw prompt or response.

## ComparisonReport

Equal-case/equal-ceiling proof; ordered observation fingerprints; total cost and verification metrics; deterministic fingerprint; R36B verdict fixed to `NO_PROVIDER_SELECTION`.

## R37CampaignManifest

Packet fingerprints; exact case IDs; proposed call/spend ceilings; stop conditions; secret-reference names only; state fixed to `PREPARED_NOT_AUTHORIZED`.

## State transitions

```text
CANDIDATE_ONLY
  -> PREPARED_NOT_AUTHORIZED       (R36B maximum)
  -> R37_OBSERVED                  (future explicit authority)
  -> CERTIFIED | REJECTED          (future verified adjudication)
```

A changed packet, case, model ID, price, privacy rule or response contract creates a new version and fingerprint.
