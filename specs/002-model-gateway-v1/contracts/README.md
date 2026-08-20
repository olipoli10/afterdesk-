# Model Gateway v1 Contracts

These contracts define the evidence boundary for the classification canary. They are implementation constraints, not vendor-selection claims.

## Authority order

1. Accepted task and tenant facts define the requested operation.
2. A published immutable policy version selects only certified route-profile versions.
3. A durable decision authorizes or refuses one attempt before dispatch.
4. A conservative spend reservation exists before any billable dispatch.
5. One adapter executes at most one external attempt.
6. Dispatch, usage, privacy and output-contract evidence determine the attempt disposition.
7. Only a verified result may close the logical operation as successful.

No adapter, model response, gateway intermediary or retry helper may modify scope, grant permission, choose an unlisted route or manufacture missing cost evidence.

## Contract set

- [runtime-internal.md](./runtime-internal.md): typed request, decision, adapter and result envelopes.
- [adapter-conformance.md](./adapter-conformance.md): shared behavioural contract for synthetic, direct and gateway-mediated routes.
- [db-invariants.md](./db-invariants.md): persistence and concurrency invariants that must fail closed.
- [audit-events.md](./audit-events.md): content-free operational event vocabulary.

Passing these contracts proves boundary conformance only. It does not prove provider quality, reliability, privacy, price advantage or production adoption.
