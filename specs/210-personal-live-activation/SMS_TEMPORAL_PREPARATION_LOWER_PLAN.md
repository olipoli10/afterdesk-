# OFF single-slot temporal question preparation

2026-09-10. Next bounded local step after registry native19/19. No worker/outbox edits, schema changes, provider calls, activation, calendar draft or new model call.

## Outcome

Prepare a correlated temporal question **only** when the original stored candidate is a complete calendar template with exactly one ambiguous time slot. MISSING_END_TIME, CLARIFY-only, missing template fields, multiple actions/dependencies, unsafe original context or unsupported syntax receive a fixed full-reformulation result. Never advertise those cases as recoverable by a bare hour.

Eligibility means the existing grammar can attempt resolution when a genuine new SMS supplies an explicit hour. It does not mean every hour will produce a valid event: DST gaps/folds, end-before-start and changed grants remain deterministic refusals.

## Ownership and shared checks

- New `personal-assistant/sms-temporal-question-preparation.ts` and dedicated unit tests.
- Narrow additive export of the existing unsafe-whole-source predicate in `personal-intent/correlated-temporal-evidence.ts`; replace its inline invocation without changing grammar. Existing evidence/resolution tests must stay green. This avoids maintaining a second list of negatives/dependencies.
- Reuse the existing read-only `review-proof` loader, `resolvePersonalCalendarTemporal`, `classifyPersonalCalendarTemporalSlot`, full-wire formatter and durable registry store.
- Never call the draft-producing review consumer, construct a pretend answer, merge SMS text or resolve a date using an invented hour.

## Proposed two-stage contract

1. A read-only inspection accepts actor/source claim/model child ids under a caller-owned SERIALIZABLE transaction and original deadline/signal. Reload the existing proof and current source; inspect exactly one PREPARE_CALENDAR_EVENT with no dependencies. The existing resolver must return AMBIGUOUS_TIME, exactly one lexical slot must be AMBIGUOUS and the other EXPLICIT. Return a frozen **non-authorizing** eligibility/whole-wire question or fixed reformulation result. This can run before the caller inserts any outbound question.
2. Attachment accepts those same ids plus an **already-existing question outbound id**. It repeats inspection from DB, never accepts a caller-supplied eligibility snapshot. If eligible, delegate to the exact durable store, which rechecks the source claim, current authority, full question hash and source final-CAS requirement. Return only its provisional `committed:false` result. If ineligible, throw so the caller rolls back the superseded question rather than publishing it.

Both helpers are OFF unless explicit local preparation and registry switches are true. Flags are checked before parsing/DB and after awaits. Inspection returns DISABLED without DB work; post-question attachment throws even when OFF at entry, so a switch revoked between the two calls cannot leave a superseded unbound question committed. No switch is set by this work. Refusal performs no registry/draft/outbox write. The existing store remains independently strict.

## Critical future integration rule

The worker must inspect **before** inserting its question. On refusal it selects the full-reformulation message, not the original unresolvable question. Attachment runs after inserting the eligible exact question and before source final CAS in the same transaction. If reinspection disagrees, rollback rather than committing an obsolete question. No worker wiring is part of this step; a standalone helper cannot make that future call sequence true by itself.

## Falsifiable local tests

OFF/no DB; caller isolation and original deadline; valid START/END ambiguity; complete explicit template not treated as a question; CLARIFY-only/missing end/two ambiguous slots; negative/conditional/dependent/multi-action originals; wrong action/claim/actor; context changing between inspection and attachment; same complete wire/version; store never invoked on refusal; no preview/UTC/draft/model/transport invented by eligibility; existing pure evidence/resolution behavior unchanged.

## Local implementation receipt

2026-09-10 10:02:21 America/Toronto: 176/176 focused tests PASS across eight suites, including 25 new lower tests, both correlated evidence/resolution author+review suites, the original 58-case correlator, 15 independent correlator cases and seven full-wire formatter tests. Root TypeScript and scoped ESLint PASS before this documentation update. First new-suite run had two fixture-only errors from mutating the canonical inspector's frozen arrays; corrected by cloning the mock proof, not by changing production immutability.

The unsafe predicate is exported from the existing evidence module with its literal regex and normalizer unchanged. The source namespace advisory lock is acquired before the canonical proof's source locks; current pair/time/body/source-id are checked again under the same transaction. No native PostgreSQL test of this new lower module or worker wiring is claimed by this receipt. Peer review is pending; the prior native19 registry receipt does not substitute for integration proof of this helper.

Follow-up: post-question OFF now throws before parsing/DB; the 26-case lower suite passes, including switch revocation between inspection and attachment. Root TypeScript and scoped lint pass after this change. Four native SQL cases have been added to the existing temporal-registry fixture (29 total, prior25 preserved): actual START and END attachment plus final source CAS, missing-end refusal without a question, and current Google grant change after question insertion causing the exact attachment refusal and full rollback. Fixture TypeScript/lint pass. These four cases have **not** been run by the author; the controller owns the serialized native database slot.

Independent source review is now GREEN: `audits/SMS_TEMPORAL_QUESTION_LOWER_REVIEW.md`, seven independent tests +26 author tests =33/33. Reviewer mechanically verified the predicate/normalizer extraction against Git HEAD. Final author combined legacy run was177/177 at10:10:27. Review of the parent's later worker wiring is a separate scope and receipt, not implied by this lower verdict.
