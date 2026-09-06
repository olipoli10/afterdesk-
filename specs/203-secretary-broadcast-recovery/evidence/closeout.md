# R38G closeout

Verdict: `LOCAL_SECRETARY_BROADCAST_RECOVERY_READY`.

The mobile app now stores the exact group-text approval command before any
network attempt. Offline or interrupted work becomes a durable
`OUTCOME_UNKNOWN` entry and explicit retry reuses the same command id, draft,
version and payload hash. A changed payload under the same id is refused.

After an uncertain API result, the app reads the canonical draft. If the exact
payload is already `APPROVED_UNSENT`, the local command reconciles as confirmed
instead of asking for a second approval. No command is dispatched
automatically.

Validation passed: 8 focused mobile tests, all 182 mobile tests, mobile
typecheck and lint, the 597-module provider boundary and `git diff --check`.
No provider, credential, customer data, SMS transport, call, deployment,
Preview, Production or store action was used.
