# Two-source temporal evidence — local pure seam

Implemented locally, not wired or activated, 2026-09-10.

`personal-intent/correlated-temporal-evidence.ts` accepts the existing pure correlator's complete input, not a caller-supplied merged event. It replays that correlator, original source-bound candidate inspection and the current temporal question. It preserves both actual source packets, envelope hashes, exact UTF-16 citations, original receipt anchor, timezone and required future atomic transition. Canonical evidence hashes are stable across JSON object order.

Successful shape: `EVIDENCE_INSPECTED_NOT_RESOLVED_NOT_AUTHORIZED`, slot START or END, original title/start/end citations plus the new answer citation, correlation/evidence hashes. Every authority, persistence, provider and temporal-resolution flag stays false. No UTC/date output, event draft, API, provider, DB or worker integration exists here.

The additive `classifyPersonalCalendarTemporalSlot` export in `temporal.ts` shares the existing `parseWall/time` implementation. The old resolver is unchanged. The classifier reports only AMBIGUOUS/EXPLICIT/UNSUPPORTED: END uses the receipt date solely to classify time-only grammar, not to assign the event date. It proves neither DST uniqueness nor start/end ordering. No second date parser and no stitched synthetic SMS are introduced.

CLARIFY-only, dependencies, incomplete/unsupported fields, two ambiguous slots and unsafe original context return INSUFFICIENT_ORIGINAL_TEMPLATE. Invalid source/current binding/receipt/replay state throws via the strict correlator. Exact lexical replies cannot carry an additional date, timezone or instruction. Source-context screening is a conservative closed check, not proof of general French semantic interpretation.

An explicit classified time is not a valid appointment. In particular DST-adjacent tests preserve the original sources and anchor but intentionally produce no UTC instant. Before later resolution, current gateway primitives need a separately reviewed two-source resolver that retains date/title provenance and recomputes all DST/order/authority checks. A CLARIFY-only missing-end proposal still cannot invent its absent title/start template.

First test run: 27/28; the source dependency guard wrongly matched `après` inside the supported `après-midi` daypart. Narrow guard correction excludes that daypart only; original regression retained. Subsequent results belong to the validation receipt, not a provider or Samsung claim.

Independent review then reproduced two additional lexical false acceptances: `Ne rajoute plus...` and `Don't add...`. The template context guard now includes French `ne` and closed English negative contractions; the independent red tests remain as regressions. This is still conservative lexical screening, not general language understanding or execution authority.
