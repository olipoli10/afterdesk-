# US2 — explicit fallback and spend integrity

## Scope

Local-only evidence for T033–T043.  All provider adapters in this proof are
synthetic.  No provider credential, candidate gateway, Preview or Production
route was invoked.

## RED to GREEN

- Provider failures were initially unclassified at the Model Gateway boundary,
  and no immutable fallback resolver existed.
- A concurrent fallback test initially had no separate authorization path.
- A dispatched-unknown adapter result was initially settled at the full ceiling;
  this was unsafe because it fabricated a known cost from an unknown outcome.

The implemented boundary now translates existing work-engine error classes one
way into the closed Gateway vocabulary; evaluates only an exact published
fallback rule; reserves the remaining logical ceiling under a new attempt;
keeps any ambiguous dispatch hold `held`; and releases only a conclusively
non-dispatched attempt.

## Green evidence

| Gate | Result |
| --- | --- |
| Fallback/provider-error unit suite | 17 PASS |
| Typecheck | PASS |
| Disposable PostgreSQL spend suite | 2 PASS |
| Disposable PostgreSQL fallback concurrency suite | 1 PASS |

The integration fallback fixture settles the first attempt at 1,000 micro-units,
then races two fallback admissions. Exactly one owns the unique second hold; the
new hold is 99,000 micro-units, so total logical exposure remains 100,000.

## Named mutation proof

| Mutation | Named guard | Result after mutation | Restoration |
| --- | --- | --- | --- |
| `gateway-dispatch-without-hold` | pre-dispatch lineage requires a held unique account reservation | RED: dispatch guard rejects the missing/changed hold before transport | byte-exact source restored |
| `gateway-releases-ambiguous-spend` | unknown dispatch leaves the hold `held` with no settled cost | RED: unknown-exposure integration assertion fails | byte-exact source restored |
| `gateway-silent-route-substitution` | fallback resolver requires the policy's exact next route pin | RED: fallback eligibility test refuses substituted route | byte-exact source restored |

## Remaining boundary

This proves fallback/spend behavior only. It does not certify a real provider,
select a gateway vendor, enable rollout, or treat unknown provider usage as zero.
