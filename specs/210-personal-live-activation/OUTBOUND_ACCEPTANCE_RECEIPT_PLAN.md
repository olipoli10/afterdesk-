# Outbound provider acceptance is not delivery

2026-09-10, local continuation. Owner: main controller. Dependencies: existing
personal outbox, bounded Twilio adapter; registry76 is separately owned/reviewed.
No provider invocation, credentials or flag activation. Schema execution below
is restricted to an owned disposable native PostgreSQL cluster.

## Plan and bounded goal

1. Reproduce the adapter's acceptance of negative/unknown REST statuses using
   injected synthetic responses. Preserve failures; no paid API experiment.
2. Accept only the documented immediate outbound progression for this adapter:
   SMS queued/sending/sent/delivered; voice queued/ringing/in-progress/completed.
   This adapter uses an explicit From, not Messaging Services or scheduling.
   Refuse negative, inbound, scheduled, unsupported and conflicting error states.
   Preserve the uncertain/no-retry path and the complete spend reservation.
3. Persist `acceptedAt` in the same exact processing1-to-completed SQL CAS as the
   provider SID and approval hash. Its meaning is **database observation time of
   the provider-acceptance response**, not Twilio's exact acceptance time, handset
   delivery or a human read. Use the database clock in canonical UTC milliseconds;
   never a caller date, an updatedAt inference or an earlier transaction clock.
4. Retain separate signed delivery receipts. No callback fabricates acceptedAt
   and no completion returns delivered=true. A lost/unknown terminal commit has
   no automatic retry or manufactured successful receipt.
5. Review focused adapter/outbox tests and native UTC/New_York/Tokyo cases after
   the independent registry76 migration is stable and approved for local use.
   The future atomic registry WAITING hook remains distinct until implemented.

The goal is this bounded receipt correction, not a live-service claim. Continue
other authorized campaign work afterward; no extra founder GO or test.

## Primary documentation checked 2026-09-10

- https://www.twilio.com/docs/messaging/api/message-resource : an explicit From
  send starts queued; failed/undelivered/canceled are not successful progress.
- https://www.twilio.com/docs/voice/api/call-resource : queued/ringing/in-progress/
  completed are distinct from failed/busy/no-answer/canceled. A completed call
  does not prove a particular person heard or understood the message.
- https://www.twilio.com/docs/messaging/guides/outbound-message-status-in-status-callbacks
  : later status callbacks are distinct from the initial create response.

Inference: rejecting an unexpected response conservatively is appropriate here;
it may retain uncertain exposure, but cannot falsely unlock a clarification or
resend automatically. These public reads grant no provider execution authority.

## Reproduction

05:16:56 local: adapter37 tests =19 RED/18 controls PASS. Invalid SMS/voice states
and queued responses with contradictory error fields returned accepted-looking
results. 05:17:41: actual outbox dispatch under mocks produced terminal SQL with
no acceptedAt (one RED,24 deliberately filtered tests). This is a source/contract
reproduction, not an execution of PostgreSQL or a provider response observation.

## Verified implementation checkpoint

Focused implementation: 123/123 PASS; separate reviewer: 69/69 PASS. TypeScript
and scoped lint passed. Native PostgreSQL 17.11 with 76 migrations then passed
16/16 at 2026-09-10T13:29:10.225Z, recorded in
`evidence/postgres-native-1789046929790`. This includes six new cases: UTC,
America/New_York and Asia/Tokyo database-clock receipt persistence, and three
negative SMS statuses retaining uncertain exposure without a second dispatch.
The fake response's forged future timestamp is ignored; the actual stored
timestamp falls between observed database-clock bounds. Ten existing outbox
tests also pass. All HTTP responses are synthetic, not Twilio observations.

The owned cluster `personal-pg-native-92f475ec0937422e813ebc754745d141` was
stopped and retained. Migration76 was applied, but these outbox tests do not
prove its clarification registry constraints. That registry and the atomic
WAITING hook remain separate ongoing work. This checkpoint does not close the
campaign, activate a provider or change readiness metrics.
