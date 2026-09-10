# Independent review: disabled OpenRouter STT candidate

Date: 2026-09-10. Reviewer lane: personal_gateway_subject.

## Scope and conclusion

Reviewed the delta from `8a9ee0b4` in `src/server/model-gateway/voice/adapters/openrouter-candidate.ts` and `src/server/model-gateway/policy.ts`, and their existing envelope, response, projection and privacy-policy contracts. No production files changed by this reviewer.

No actionable critical defect found in this bounded delta. This conclusion means the current candidate remains non-dispatching; it is not an ASR quality, privacy certification, provider-availability or live-product approval.

The candidate factory never invokes its supplied transport, including with an exact envelope, a proposed provider pin, either ZDR setting, repeated dispatch requests or an already-aborted signal. Policy eligibility independently refuses this adapter for initial and explicitly declared fallback routes. A separately eligible direct synthetic route remains selectable.

The local wire helper exposes only the transcription request fields, without provider-routing or privacy promises. Response normalization reads `usage.seconds`; omitted usage remains null. Reported USD cost is a separate rounded-up metadata field, never `measuredCostMicros`, a settlement receipt or permission to release a spend hold. Malformed usage, unsafe costs and non-success statuses do not yield successful transcript normalization.

## Primary-source check

The [official OpenRouter speech-to-text documentation](https://openrouter.ai/docs/guides/overview/multimodal/stt), read on 2026-09-10, documents the transcription endpoint separately from chat completions. Its request-parameter table says routing preferences `order`, `only` and `ignore` are not applied. Its response contract lists `usage.seconds`, USD `usage.cost`, and the separate `X-Generation-Id` header. These facts support keeping the candidate disabled; they do not independently certify the endpoint's data handling or billing reconciliation.

## Independent executable regressions

Added only `test/model-gateway-openrouter-stt-review.test.ts`: 30 tests, all passing in a fresh local run. Tests use synthetic byte arrays, pure policy snapshots and injected spies. They exercise candidate dispatch refusal, initial/fallback exclusion, a positive synthetic direct-route control, exact wire fields, receipt identifiers, unknown-versus-zero usage, malformed usage, cost bounds and HTTP error classification.

No product API, credential, database, native process, provider transport, audio hardware, build or deployment was used. Multiple agents reviewing the code are not an independent measurement of model quality. Existing conformance fixtures are owned and maintained by the parent lane, not changed by this reviewer.
