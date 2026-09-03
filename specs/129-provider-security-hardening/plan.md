# Implementation Plan: Provider Security Hardening R37G

1. Freeze the five confirmed findings from the completed R37A-R37F security diff scan.
2. Add focused RED tests for runtime seal drift, foreign grant binding, stale lease fencing, digest recomputation and failed-result evidence.
3. Add self-validating R37A sealed-attempt runtime contracts without weakening R37C checks.
4. Move workspace/grant/role authorization before controlled-run creation.
5. Propagate the R37C run ID and lease token into R37F and require both on canonical writes.
6. Recompute canonical digests on recovery and couple evidence visibility to successful dispositions.
7. Run R37A-R37G unit, disposable PostgreSQL, type, lint and Git gates, then advance the autonomous queue.

No provider, credential, network route, schema change, migration, external write or customer data belongs in this release. Caller-controlled time remains a deferred future-route finding and must be resolved before any untrusted route is authorized.
