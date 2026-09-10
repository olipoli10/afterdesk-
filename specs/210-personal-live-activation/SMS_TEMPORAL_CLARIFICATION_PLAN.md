# ADR — Correlated temporal SMS clarification, pure local foundation

Status: proposed persistence/integration; local contract authorized for implementation.
Date: 2026-09-10. Campaign owner: parent agent. Queue follow-up: SMS_TEMPORAL_CLARIFICATION_CORRELATION.

## Context

SMS_TEMPORAL_CLARIFICATION currently provides fixed questions and deterministic dates, but explicitly has no cross-SMS correlation. The current gateway accepts exactly one source operation/text. An isolated `14h` must not silently inherit the date, recipient, project or authority of an arbitrary old message.

## Decision and bounded order

1. Add only a pure contract beside the existing personal-assistant modules and dedicated synthetic tests. Reinspect the original proposal with the existing personal-intent contract/resolver; retain its exact bytes/hash and source anchor. Only the fixed AMBIGUOUS_TIME / MISSING_END_TIME questions are eligible.
2. Pin owner/workspace/verified phone identity, revisions and inbound/model/calendar grant versions; original source operation, envelope hash, model child and proposal, question hash, UTC receipt instant, timezone, and TTL at most ten minutes.
3. A question becomes WAITING only from an exact modeled outbound acceptance receipt. A reply must represent a new verified inbound source from the same bound sender/service pair, received after that acceptance, with a current one-attempt source lease. Reject non-unique pending questions, changed bindings, reused/replayed sources, terminal state, expiry and ambiguous/multi-action replies.
4. Accept a narrow explicit 24-hour time literal only. Return a two-source evidence packet, preserving each exact source/quote and the ORIGINAL receipt anchor. The result remains CORRELATED_NOT_RESOLVED_NOT_AUTHORIZED: no fake concatenated original SMS, new year/date, event draft, provider call or approval.
5. Test tampering, current-context drift, exact question/outbound binding, causal ordering, midnight crossing, response grammar, replay/state transitions and deep immutability. Peer review before integration.

## Options and trade-off

Blindly concatenate messages into the current gateway input: rejected, because citation provenance and the relative-date anchor become misleading. A second conversational gateway: rejected. The chosen bounded evidence packet leaves existing gateway authority unchanged and requires an explicit future multi-source inspection seam.

## Future persistence / integration, not implemented here

- A durable clarification row needs immutable owner/source/model/question/expiry bindings and a single active namespace per owner + verified phone pair, with DB-clock expiry and permanent unique consumed reply operation/SID.
- Preparing the question must occur in the existing source final-CAS transaction; question dispatch must reuse current self-reply consent, outbox gates, budget and one-attempt fence. WAITING requires its exact accepted outbound receipt; accepted is not delivered/read.
- On incoming SMS, lock the unique pending clarification, reload all current authority and exact sources, then atomically consume the reply and clarification with the source final CAS. Failed or ambiguous correlation must never fall through to a second mutating interpreter.
- The existing gateway/review consumer needs a versioned two-source input/provenance contract before any clarified event preparation. Preserve original date anchor across midnight. Resolve dates/DST through the existing deterministic temporal resolver after that explicit contract extension; do not implement a second date parser here.
- Full-wire seam implemented locally: `model-worker.personalModelReviewReply` delegates to pure `model-review-message.ts` without changing its exported signature or text. Clarification pins `wireText`, `wireFormatterVersion` and `wireTextHash`; its question request now matches the actual single-CLARIFY worker reply, including prefix/footer. Ordinary outbox still requires exact `source.result.reply === request.text` plus `reply:<sourceId>`. Creating the matching clarification/source/reply in one finalization transaction remains future integration; never weaken that equality.
- Correlation does not decide which candidate time span to replace. The future two-source temporal contract must explicitly bind the original date/title/affected start-or-end span and the reply time citation. A CLARIFY-only candidate contains no date/title spans: correlation alone cannot manufacture them, and does not authorize another paid model call to obtain them. Unresolved/multiple fields must remain a question or app review.
- Persist rejection rate limits, expiry and supersession; cap one waiting clarification and bounded lifetime. No repeat paid model call is authorized by this contract. No authorization or budget is created by a boolean in a pure input.

Success here means pure local contract/tests/review and the authorized presentation-only worker extraction. Stop before DB/schema/worker orchestration/route/flag changes. No SMS, Google, OpenRouter, personal data, native permissions, spending, deployment or publication. Pure functions cannot authenticate a receipt or guarantee global at-most-once consumption without the future DB transaction.
