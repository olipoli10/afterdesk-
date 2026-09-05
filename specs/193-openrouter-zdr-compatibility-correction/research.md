# Research: OpenRouter ZDR Compatibility Correction

## Decision 1 — preserve the model identifiers

**Evidence label**: `OBSERVED_PUBLIC_METADATA`

**Decision**: Keep `openai/gpt-5.4` and `openai/gpt-5.4-mini` as the comparison candidates.

**Rationale**: OpenRouter's public model pages and endpoint API list both model slugs as available on 2026-09-05. The R37 404 therefore does not prove that either model identifier is nonexistent.

**Sources**:

- https://openrouter.ai/openai/gpt-5.4/providers
- https://openrouter.ai/openai/gpt-5.4-mini/api
- https://openrouter.ai/api/v1/models/openai/gpt-5.4/endpoints
- https://openrouter.ai/api/v1/models/openai/gpt-5.4-mini/endpoints

## Decision 2 — replace `max_tokens` and remove `temperature`

**Evidence label**: `OBSERVED_PUBLIC_METADATA + CODE + INFERRED`

**Decision**: The corrected request contract uses `max_completion_tokens`, rejects `max_tokens`, and omits and rejects `temperature`.

**Rationale**: R37 required `zdr: true` and `require_parameters: true`. The current ZDR inventory contains three eligible GPT-5.4 Azure endpoints and two eligible GPT-5.4 Mini Azure endpoints. All five advertise `max_completion_tokens`, `response_format`, and `structured_outputs`; none advertise `max_tokens` or `temperature`. The frozen R37 request used both unsupported fields. With strict parameter matching, either field can remove every ZDR endpoint. This is the strongest available explanation for the observed 404, although the redacted provider error body prevents claiming it as directly observed provider causality.

**Sources**:

- https://openrouter.ai/api/v1/endpoints/zdr
- https://openrouter.ai/docs/guides/routing/provider-selection
- https://openrouter.ai/docs/guides/features/zdr

## Decision 3 — keep every safety constraint

**Evidence label**: `DECISION`

**Decision**: Preserve zero data retention, denied data collection, strict parameter support, no automatic fallback, structured output, bounded output, synthetic-only data and fail-closed behavior.

**Rationale**: Relaxing any of these would turn the next run into a different privacy or quality experiment instead of correcting the isolated compatibility defect.

## Decision 4 — do not execute another provider call

**Evidence label**: `DECISION`

**Decision**: R37B ends at locally validated retest readiness. A provider generation call requires a new exact authority packet.

**Rationale**: R37's one-shot campaign closed as immutable `REWORK`. Replaying it under changed parameters would falsify the recorded observation.

## Alternatives considered

- **Change models immediately**: rejected because both models currently exist and compatible ZDR endpoints are visible after correcting the parameter.
- **Disable ZDR or allow data collection**: rejected as a privacy regression.
- **Set `require_parameters: false`**: rejected because silent parameter dropping would make structured-output evidence unreliable.
- **Allow automatic fallbacks**: rejected because the comparison requires exact model identity and an auditable endpoint set.
