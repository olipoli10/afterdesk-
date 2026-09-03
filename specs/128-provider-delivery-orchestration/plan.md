# Implementation Plan: Provider Delivery Orchestration R37F

1. Define a strict R37F result that contains the R37C run result and canonical R37D evidence.
2. Add optional canonical-evidence snapshot and fingerprint fields through one additive forward-only migration.
3. Wrap an injected fixture adapter; normalize and store its result while the R37C run is leased, before returning to R37C for durable settlement.
4. Recover and strictly parse the canonical evidence from the durable R37F snapshot on success and replay.
5. Prove OpenRouter, Perplexity, reconnect, refusal and concurrent idempotency paths on disposable PostgreSQL.
6. Run proportional R37A-R37F regression, typecheck, lint, Spec Kit Analyze and Git checks.

No actual transport implementation belongs in this release. The migration is
nullable, additive and does not reinterpret historical R37C evidence.
