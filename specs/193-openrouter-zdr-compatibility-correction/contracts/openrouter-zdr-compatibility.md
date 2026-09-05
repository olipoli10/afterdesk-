# Contract: R37B OpenRouter ZDR Compatibility

## Inputs

- A dated public model endpoint snapshot for each exact model.
- A dated public ZDR endpoint inventory filtered to those models.
- The immutable R37 request requirements and sealed report hash.

## Required endpoint parameters

- `max_completion_tokens`
- `response_format`
- `structured_outputs`

## Corrected request invariants

- Exact model slug from the two-model allowlist.
- Exactly one system and one synthetic user message.
- `max_completion_tokens` equals 512.
- Unsupported sampling fields are absent.
- Streaming disabled.
- Strict JSON-schema output.
- `allow_fallbacks` false.
- `require_parameters` true.
- `data_collection` deny.
- `zdr` true.
- `max_tokens` absent and rejected.
- `temperature` absent and rejected.

## Refusals

- `R37BB_METADATA_INVALID`
- `R37BB_MODEL_MISSING`
- `R37BB_NO_COMPATIBLE_ZDR_ENDPOINT`
- `R37BB_REQUIRED_PARAMETER_MISSING`
- `R37BB_R37_SEAL_DRIFT`
- `R37BB_PROVIDER_EXECUTION_FORBIDDEN`

## Output

A deterministic compatibility decision and corrected request object. Neither output authorizes or performs provider execution.
