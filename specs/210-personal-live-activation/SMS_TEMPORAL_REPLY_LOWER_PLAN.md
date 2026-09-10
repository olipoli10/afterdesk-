# Standalone OFF incoming temporal reply lower

2026-09-10. Implements the approved incoming-router design without wiring `sms-worker.ts`. Owned new source `sms-temporal-reply-worker.ts`, dedicated tests and this note. The existing pure time classifier is shared; the controller extracted the unchanged whole-message day-read classifier separately.

Inputs are only the controller's claimed inbound operation/actor/lease plus original deadline/signal. Reload exact processing1/live claim and checked envelope, then reserve calendar vocabulary and exact day-read as bypass dispositions. For other messages lock the existing visible pair namespace before inspecting up to two shared expectation rows without reversing question/ledger row-lock order.

No active question + time-shaped reply gets a fixed missing-context response. Active foreign/broken/expired/not-yet-asked context never becomes model fallback. Only owned WAITING + time-shaped message + STORE/BRIDGE/REPLY gates calls the existing strict consumer, which authoritatively revalidates all current owner/identity/model/calendar permissions. A complete unrelated command while WAITING receives a fixed non-consuming disposition. Fixed/bypass dispositions are routing hints only and do not complete the source or create a message; future existing worker finalization must authenticate any self-reply.

The standalone wrapper executes consume and exact ordinary self-only acknowledgment insertion in one bounded SERIALIZABLE transaction, preserving the original deadline. The consumer already owns permanent receipt/counter/question/source finalCAS. Recheck flags/deadline/signal after consumer and acknowledgment await and just before returning the transaction; only known commit becomes HANDLED. No model, legacy engine, Google action, provider or draft call, and no second source CAS. No retry on SQL/commit uncertainty.

The generic read-only reservation function remains usable while STORE/BRIDGE/REPLY processing is OFF so a durable context cannot disappear into the ordinary model branch. Global SMS worker OFF or invalid controller deadline throws, never an eligible fallback. The existing claim controller and consumer remain the authority for verified ingress/current permissions; this routing result grants none.

Tests will prove fixed dispositions, reserved/day priority, exact literal/nonliteral handling without attempt burn, current claim/namespace/order, snapshots/deadlines/withdrawal after awaits, real classifier use and exact acknowledgment/source ownership. Native source-CAS/receipt/ack atomicity and concurrency must be tested by the controller before any live worker wiring. No database or provider is run by this lane.

## Local checkpoint — 2026-09-10 10:52:56 America/Toronto

Author validation: 39 standalone reservation/consumption tests plus 38 shared-classifier tests PASS (77/77); root TypeScript and scoped ESLint PASS. Consumer and transaction persistence are mocked in these tests: callback rejection is observed, but actual rollback is not claimed. The controller owns the upcoming native PostgreSQL fixture. An independent reviewer is checking the lower in a separate test file.

The calendar-kind ledger branch is a routing hint only. It does not load or authenticate the concrete calendar confirmation and never permits approval. The separate reserved confirmation route keeps that responsibility. Fixed/bypass results explicitly retain `sourceCompleted:false`; a read-only transaction's `committed:true` must never be confused with completion of the inbound operation. No running SMS worker imports this new module yet.

## Review decision and coordinated correction

The reviewer identified that the first lower version let a non-time message pass as `NOT_TEMPORAL_CONTEXT` when a calendar confirmation ledger entry remained active, despite the design's no-fallback rule for a protected context. The controller chose the conservative rule: after reserved-calendar and independent-day-read priority, **any** remaining message with an active calendar expectation receives `OTHER_CONTEXT`, without consuming an attempt or reaching the model. A new-command/cancellation grammar is not implemented by this tranche; this is not a general multitasking-assistant claim.

The controller's pre-correction native checkpoint passed 55 tests and stopped cleanly at 14:54:42.641Z (`evidence/postgres-native-1789052045310`). The independent regression then observed 1 FAIL / 6 PASS at 10:56:00 local: active calendar plus a complete new command improperly returned `NOT_TEMPORAL_CONTEXT`. After the authorized one-line source correction, author rerun of 39 lower tests, 7 independent lower tests, 38 classifier tests and 2 independent classifier tests passed 86/86 at 10:56:24. The earlier native receipt does not prove this subsequent correction; the controller owns the next native cases. No provider, live worker integration or real-phone observation occurred.
