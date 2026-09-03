# Implementation Plan: Provider Delivery Orchestration R37F

1. Define a strict R37F result that contains the R37C run result and canonical R37D evidence.
2. Wrap an injected fixture adapter; normalize its result before returning it to R37C for durable recording.
3. Recover and strictly parse the canonical evidence from the durable R37A body on success and replay.
4. Prove OpenRouter, Perplexity, reconnect, refusal and concurrent idempotency paths on disposable PostgreSQL.
5. Run proportional R37A-R37F regression, typecheck, lint, Spec Kit Analyze and Git checks.

No actual transport implementation belongs in this release.
