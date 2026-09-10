# Autonomous correlated calendar read card

2026-09-10. Historical first slice: autonomous local read-only implementation; integration was not then authorized. The later controller-approved owner-list integration is documented in CORRELATED_CALENDAR_LIST_INTEGRATION.md. Approval remains unavailable.

Decision: keep the strict entry parser separate from rendering. `parsePersonalCorrelatedCalendarReview` accepts only version `personal-correlated-calendar-review-v1`, reviewId, inspectedAt/preparedAt/preparationExpiresAt, the five agreed states, the four fixed read/authority flags and the existing local-preview evidence envelope. Server wrapper status/committed belongs outside this entry. Backend author confirmed it will return the exact entry in `review`.

All timestamps must be canonical UTC millisecond strings. The necessary local chain is answer.receivedAt <= preparedAt <= inspectedAt < preparationExpiresAt. This is not proof of the server's full receipt/claim causal chain. The parser uses the existing evidence inspector, preserves both exact texts/citations, returns a detached frozen entry and never authenticates hashes, authority or semantic meaning. It neither uses Date.now nor claims the recorded inspection is still current; a future caller owns fresh reads and must clear stale workspace data.

`PersonalCorrelatedCalendarReviewCard` validates its entry at the rendering boundary and contains no action props, API, fetch, POST, native permissions or session hooks. Locale is an optional fr-CA/en-CA presentation prop; no phone timezone is inferred. It reuses the unchanged existing calendar formatter. Invalid entry renders a fixed unavailable notice without showing its unverified texts. Invalid Intl/local-zone rendering keeps valid raw evidence and a fixed notice.

Both full texts appear before the draft. Pending alone may say “pas encore ajouté”; processing/completed/uncertain/refused never use that claim. Completed is a recorded process state, not a confirmed Google event. Provenance enums remain SYNTHETIC_LOCAL or UNKNOWN; visible labels are “Exemple de test — données synthétiques” and “Origine non vérifiée”. One read-only notice is sufficient; technical timestamps are grouped and the initial receipt is not repeated as an “anchor”. No approval button exists even for pending. No receipt UUID or calendar operation id must be copied by a user.

The first slice added no screen/route/API import. The subsequent local integration imports this unchanged functional card through its scope-bound list; native-device and live-provider behavior remain unobserved.

Local validation, 2026-09-10 12:37 America/Toronto: 121/121 targeted tests PASS (36 new parser/render + 44 existing preview + 18 independent preview + 23 unchanged formatter), mobile TypeScript and scoped lint PASS. The first new render run had 34 PASS/2 FAIL: the card passed the draft title as an extra field to the strict date formatter. Selecting exactly startsAt/endsAt/timezone corrected that new-card defect; the existing formatter was not changed. Tests render actual React card output with React Native primitives mocked, not a mounted native device.

The standalone slice requested independent card/parser review and controller reconciliation with the actual server item. Integration and live freshness handling now belong to the separate owner-list lifecycle, never this card's own API or action authority.

Copy refinement requested by controller: 122/122 targeted tests PASS at 12:39 (37 card/parser tests), scoped lint PASS; parser and formatter unchanged. The additional render test pins the single read-only notice and non-repeated initial timestamp.
