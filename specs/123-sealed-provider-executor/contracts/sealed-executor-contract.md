# R37A Contract

`sealSyntheticAttempt` accepts only current R36B packet/case/request-plan
fingerprints and a local synthetic authorization. `runSyntheticAttempt` accepts
only a supplied adapter result declaring zero external transport.

`requestObservedProviderExecution` always throws
`R37A_OBSERVED_PROVIDER_AUTHORITY_REQUIRED` in this release.
