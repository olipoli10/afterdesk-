# Spec Kit analysis — R36A

## Result

`PASS_WITH_EXTERNAL_EXECUTION_DEFERRED_TO_R37`

## Coverage

- Requirements FR-001 through FR-018 map to T001 through T015 and automated tests.
- User stories US1 through US5 have independent acceptance coverage.
- Registry, policy, route, request and decision identifiers are closed and versioned.
- Canonical state and deterministic tools precede model candidates.
- Public-person research raises data/privacy ceilings and restricted-person
  research fails closed.
- Cost, privacy evidence, breaker state and availability affect eligibility.
- Fallback is explicit and ends in bounded human support.
- Replays are immutable within the accepted routing session.
- Audit evidence excludes raw content and credentials.

## Contradictions resolved

The initial wording said an external research/controller route was already
certified. R36A has no provider evidence or authority, so the accepted
specification now says `eligible candidate`; execution requires R37
certification. No implementation or evidence claims a globally best model.

## Deferred, not missing

- exact provider and model benchmark;
- live price and privacy evidence;
- sandbox credential handling;
- source-output verification against a real research result;
- durable Model Gateway operation persistence for new provider operations;
- live inbound SMS/voice integration and user observation.

Those items require the separate exact authority of R37 and are not permitted
under R36A.

