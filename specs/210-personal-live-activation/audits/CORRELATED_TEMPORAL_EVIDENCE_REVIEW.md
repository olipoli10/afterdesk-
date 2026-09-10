# Correlated temporal evidence — independent pure review

2026-09-10. Scope: `correlated-temporal-evidence.ts`, additive `classifyPersonalCalendarTemporalSlot`, corresponding plan and tests. Reviewer owns only an independent test file and this note; no production edits, database, model, provider or native execution.

Verdict: GREEN for the bounded pure evidence seam after the following correction. It is not a semantic correctness or action-authorization certificate.

## Reproduced and corrected

At 04:28 local runtime clock, independent tests were 1 PASS / 2 FAIL. With valid synthetic correlation inputs, both original texts `Ne rajoute plus visite demain à 2h jusqu’à 16h.` and `Don't add visite demain à 2h jusqu’à 16h.` incorrectly returned `EVIDENCE_INSPECTED_NOT_RESOLVED_NOT_AUTHORIZED` instead of `UNSAFE_SOURCE_CONTEXT`. All authority flags nevertheless remained false; no action was performed.

The author extended only the conservative unsafe-context markers to `ne`, `cannot`, and specified English negative contractions. The original failures are retained. This closes these lexical omissions, not general French/English intent interpretation.

## Fresh verification

- 13 independent tests plus 31 author evidence tests, 58 correlator tests and 15 earlier correlation counter-tests: 117/117 PASS, 04:29 local runtime clock.
- Exact original and reply packets remain separate. Title/start/end citations retain original UTF-16 positions, including supplementary characters; reply citation retains its exact whitespace and source hash.
- Original receipt/timezone anchor survives midnight. Exactly one ambiguous START or END can be classified; two ambiguous slots are refused. This does not assign a calendar date to an END-only literal or prove DST/order/duration.
- Current identity revision changes, response instructions and malformed source hashes cannot be converted into eligible evidence. Returned nested evidence is detached and frozen.
- Canonical correlator and candidate inspection are reused. Existing parser implementation is shared by the additive classifier; no second parser or synthesized merged SMS was introduced.

All source authentication, persistence/CAS, temporal resolution, provider and action authority remain outside this pure seam. No worker/API integration, actual SMS, Google event, model call or user data was exercised. Repeated pure inspection is not durable one-use protection.
