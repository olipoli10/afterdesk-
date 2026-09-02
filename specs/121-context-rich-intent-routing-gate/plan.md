# Implementation Plan: Context-Rich Intent Routing Gate

## Summary

Insert the R36A policy gate inside R18 after authorization/source claim and before resolution. Extend the R18 result with an optional provider-neutral routing projection and persist the projection in the existing audit ledger.

## Design

1. Extend the strict R18 result contract with optional R36C routing metadata and precise local routing refusal reasons.
2. Map R18 source kinds to R36A channels and construct trusted server routing input.
3. Persist one audit decision keyed by workspace and source ID.
4. Return early for non-internal dispositions with no canonical transition.
5. Attach the routing projection to every internal result without changing caller-required fields.
6. Prove source parity, audit replay and R25/R26 compatibility on disposable PostgreSQL.

## Safety and rollback

- No schema, dependency, provider or network change.
- Existing R18 source-claim and authority checks run before the routing decision is accepted.
- Revert this feature commit to restore the prior resolver path; no external state exists.
