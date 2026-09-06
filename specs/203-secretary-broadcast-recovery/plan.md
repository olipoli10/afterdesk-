# Plan: Secretary broadcast mobile recovery

1. Add a dedicated durable outbox kind and strict stored-command parser.
2. Enqueue the frozen approval before API dispatch.
3. Preserve the same command through offline and outcome-unknown states.
4. Reconcile canonical `APPROVED_UNSENT` state before surfacing uncertainty.
5. Add explicit mobile retry and discard controls without changing authority.
6. Prove restart, replay, conflict, role isolation and zero transport locally.
