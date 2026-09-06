# Tasks: R38G secretary broadcast mobile recovery

- [x] Add a strict durable outbox kind for exact broadcast approval.
- [x] Store the command before any network attempt.
- [x] Reuse the same command through restart and explicit retry.
- [x] Reconcile canonical approval after an outcome-unknown response.
- [x] Surface queued, unknown, conflict, confirmed and replayed states.
- [x] Prove idempotency conflict, workspace filtering and zero auto-dispatch.
- [x] Run mobile typecheck, lint, tests and provider-boundary validation.
- [x] Record local evidence and continuation state.
