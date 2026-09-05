# Research: Corrected OpenRouter Retest

## Established inputs

- `CODE + TEST`: R37 uses two exact model IDs, three immutable synthetic cases, per-attempt reservation, model-specific grants, grounding oracle, stop-on-first-failure and cleanup.
- `OBSERVED_PROVIDER_SYNTHETIC_INPUT`: The first R37 run dispatched once and returned HTTP 404; its sealed verdict is REWORK and its report hash is fixed.
- `OBSERVED_PUBLIC_METADATA + CODE + INFERRED`: R37B found healthy strict-ZDR endpoints for both models when using `max_completion_tokens`, while `max_tokens` and `temperature` were incompatible across eligible endpoints.
- `AUTHORITY`: Olivier authorized one corrected retest, synthetic data only, a new local key, and an additional ceiling of 10 CAD, with no real communication or deployment.

## Decisions

1. Keep the prior report immutable; a new result cannot revise history.
2. Preserve the frozen model/case denominator so the retest changes only the diagnosed request incompatibility.
3. Add an explicit corrected request version inside the existing private network module; default behavior remains historical R37.
4. Create the campaign lock immediately before any provider dispatch and refuse any second attempt or report overwrite.
5. Keep the existing 5 USD application ceiling because it is stricter than 10 CAD under the dated exchange evidence.
6. Treat any provider incompatibility, oracle failure, cleanup failure or ambiguous attempt as REWORK; no retry is authorized.

## Unknowns

- Provider success, output quality and exact spend remain UNKNOWN until the one authorized observed run.
- Market value, customer readiness, mobile readiness and production readiness are outside this campaign.
