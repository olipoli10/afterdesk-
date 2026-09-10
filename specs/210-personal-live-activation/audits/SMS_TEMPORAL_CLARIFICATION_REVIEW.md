# Independent review: pure SMS temporal clarification correlation

Date: 2026-09-10. Reviewer lane: personal_gateway_subject.

Reviewed `src/server/personal-assistant/sms-temporal-clarification.ts`, its plan, tests and interactions with the existing personal-intent candidate inspector and temporal resolver. No production source changed by this reviewer.

No actionable critical defect found within this pure, non-authenticating correlation contract. The module recomputes original proposal/question/binding fingerprints, preserves the exact original and reply citations, retains the original relative-date anchor, rejects changed current bindings and requires a single pending question plus a current one-attempt reply lease. Source operation/SID reuse, changed receipt fingerprints and equal/pre-question timestamps are refused.

The result does not resolve the date or decide whether a reply time replaces the beginning or end of an event. It supplies no calendar draft or action permission. It explicitly says that incoming identity/provider-acceptance assertions are not authenticated by this pure contract. Repeating the same pure call does not consume a reply; its returned CAS requirement is an input for a future authoritative transaction, not proof that a transition happened.

Added `test/sms-temporal-clarification-review.test.ts`: 15 independent tests passed; together with the author's 58 tests, 73/73 passed in a fresh run. Checks include a midnight boundary, exact source quote offsets, detached frozen output, tampered persisted hash fields, a changed outbound receipt, reused source/outbound SIDs with recomputed envelope hashes, lease expiry and changed owner/member/identity epochs. No Twilio, Google, model, database or other network service was invoked by these tests.

Future integration still requires authenticated ingress and database reinspection, durable unique pending/consumed namespaces, atomic source/clarification consumption, current grants/budgets, existing outbox controls, and a versioned multi-source gateway contract before any event preparation. The current tests do not prove those unimplemented properties or actual delivery, semantic interpretation, at-most-once global execution, or authorization.

## Follow-up review — full outbound text and formatter binding

Reviewer lane: openrouter_disabled_adapter, 2026-09-10. Read the complete new
`model-review-message.ts`, the `model-worker.ts` delegation diff and the updated
`sms-temporal-clarification.ts`. The worker delegates the same existing reply
text without changing it. Clarification preparation now derives its full
outbound text using that formatter and pins its version and text hash.

The request hash for a question receipt covers the complete canonical outbound
request (`to`, `from`, full formatted `text`, `sourceOperationId`), not just the
short question. Reinspection reconstructs the formatter output and rejects
changed wire/version/hash fields. No critical defect observed in this bounded
delta. Fresh `personal-assistant-model-review-message.test.ts`: **7/7 PASS**,
including comparison against the real exported worker reply and rejection of
a question-only receipt. No source files changed by this reviewer.

This proves local text/receipt-contract consistency only. The pure receipt
assertion still does not authenticate a provider response, prove delivery or
authorize execution; the future DB/outbox adapter must reload that evidence.
