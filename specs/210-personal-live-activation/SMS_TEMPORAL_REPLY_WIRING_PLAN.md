# Existing SMS worker incoming temporal integration

2026-09-10. Controller-owned `sms-worker.ts` integration after the standalone
reply lower and native tests. No new endpoint/provider/runtime switch activation.

## Routing and ownership

After the existing verified ingress re-admission/exact source claim, keep
reserved calendar confirmation and closed calendar-day read ahead of all other
branches. For remaining messages always call the installed registry's standalone
reservation/consumer, including when temporal processing flags are OFF: durable
questions must not disappear into a model fallback. Required schema missing or
SQL failure follows the existing uncertain source path, never another engine.

`TEMPORAL_REPLY_HANDLED_NOT_EXECUTED` after known commit returns the existing
COMPLETED_REPLY_PREPARED result immediately; the lower owns source completion,
receipt and acknowledgment. No second source CAS, model, calendar or dispatch.
`TEMPORAL_REPLY_FIXED_RESPONSE` supplies the exact fixed text to existing
authenticated self-reply finalization with source CLARIFICATION, no model.
Only `NOT_TEMPORAL_CONTEXT` may enter unchanged model/legacy routing. A bypass
returned after the prior worker classification disagrees with the stored source
and is refused, not reinterpreted.

Use the original immutable claim/deadline/AbortSignal. Do not replace the35s
source lease or50s batch budget. A known committed lower result must return
without a postcommit expiry causing another state mutation; SQL commit failure
remains uncertain and is not retried. Fixed text is below the existing SMS
budget; final actor/identity checks remain compulsory.

## Validation

Unit: lower HANDLED owns finalization; fixed/disabled/no-context branches;
reserved/day-read skip lower and model; failure never falls through; source
mutation and deadline propagation; legacy tests update module mocks explicitly,
without changing their expected behavior. Native: actual ingress claim then
lower consume/source/receipt/ack, exact replay, unrelated/day-read context
preservation, revoked processing and invalid context. Existing source fencing
tests plus full native/root/typecheck remain required before commit.

No calendar event is prepared or created from correlation at this stage. A
typed two-source review adapter remains a separate unfinished task.

## Recorded verification in progress

Standalone native55/55 (14:54:42Z) preceded the peer's active-calendar fallback
RED. Conservative fix then native59/59 PASS at14:57:33Z, including orphan time
and two real competing reply backends. Actual worker integration adds four
real received0 ingress cases:63/63 native PASS at15:01:44.263Z in
`postgres-native-1789052457335`, normal STOPPED, no provider calls.

Existing question unit fixtures first failed11/15 because the new reader had
no mock; explicit NOT_TEMPORAL_CONTEXT preserves their original narrow scope.
15/15 then PASS at15:02:33Z. Two legacy files similarly received a no-prior-context
mock after observed14 failures; no expected behavior or assertion was removed.

Peer reproduced another internal-contract edge at15:02:44Z: FIXED_RESPONSE with
missing reply could leave the sentinel undefined and reach the model branch.
Production lower currently always supplies a string; nevertheless worker now
requires a1..1500-character string or refuses. Main50/50 combined wiring/question
tests PASS at15:03:22Z. Full native/root and final peer review remain required.
