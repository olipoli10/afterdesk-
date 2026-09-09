# Current configuration projection v3

This versioned projection supersedes application of three preserved historical reports to the current checkout. It does not rewrite those reports or convert their historical status strings into current evidence.

The three whole-product/market validator commands default to this projection. A successful exit means only `CURRENT_CONFIGURATION_COHERENCE_ONLY`: an exact five-file source set matches its recorded SHA-256 hashes, mobile app/package/release identities agree, the declared account-deletion route file exists, and the environment contract prohibits serialized values and external release authorization. Route behavior, build execution, provider operation, device operation, customer outcomes and whole-product coverage are not evaluated here.

`wholeProductReadiness`, `wholeProductClosure`, and `externalReadiness` remain `NOT_EVALUATED`; provider/customer testing remains `NO-GO`. No observed proof is manufactured. Independent command evidence must be evaluated separately.

`--historical` invokes the original strict historical report checks. Stale input hashes still fail. Even a synthetic historical fixture with all hashes recomputed returns `HISTORICAL_STATIC_ATTESTATION_ONLY`, never current closure. Protected/source inputs must be the exact canonical path set; unrelated correctly hashed files are rejected.

`current-projection-v3.history.json` records both preserved checkout-byte hashes and historical Git-blob hashes, separately to account for checkout line endings. Tests verify both. Regeneration of the current projection must happen only after the intended current input changes are reviewed. Use `buildCurrentProjection()` from `current-projection-v3.mjs` and validate its returned object with `validateCurrentProjection()`; never refresh an old report's hashes to erase drift.

The reproduction runner uses a disposable synthetic directory and in-memory attestations. Recorded before/after command evidence belongs to spec206 and is not provider, customer, device or production evidence.
