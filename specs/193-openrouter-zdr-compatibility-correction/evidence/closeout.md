# R37B closeout

## Verdict

`LOCAL_COMPATIBILITY_CORRECTION_PASS`

This is a local preparation result, not a provider retest and not an observed-provider PASS.

## Proven

- Both exact R37 model slugs exist in current public OpenRouter metadata.
- GPT-5.4 has three currently healthy ZDR endpoints matching `max_completion_tokens`, `response_format`, and `structured_outputs`.
- GPT-5.4 Mini has two currently healthy ZDR endpoints matching the same fields.
- None of the five advertises the frozen R37 fields `max_tokens` or `temperature`.
- The corrected strict request uses `max_completion_tokens`, omits both unsupported fields, and preserves ZDR, denied data collection, strict parameter support, structured output, bounded output and no fallback.
- Four focused tests, typecheck, focused lint, provider-boundary validation and `git diff --check` passed.
- Provider generation calls: `0`.
- Spend: `0`.
- R37 report SHA-256 remains `bc79e1416f82ff08665690b0140471111ce00abb0a026419bb503688b6797eb3` with verdict `REWORK`.

## Evidence boundary

Model and endpoint properties are `OBSERVED_PUBLIC_METADATA`. The explanation of the prior 404 is `OBSERVED_PUBLIC_METADATA + CODE + INFERRED`, because the provider error body was not retained. Account-level restrictions remain unknown.

## Next exact decision

Whether to authorize a new, separately sealed, bounded provider retest. No such execution was started or authorized by this correction.

## Canonical checkpoint

The canonical Brain was validated and committed LOCAL ONLY at
`a72fb648aeaa7ce253d7410bfddf2a32c449bd7d`, tree
`1dbf58c23daae7ef559cc38764ce4e262f0c3181`. Its Windows PowerShell 5.1 route
and completion guards now execute on Olivier's actual host.
