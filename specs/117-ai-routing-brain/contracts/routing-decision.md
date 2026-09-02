# Contract: Assistant Routing Decision v1

Every decision is strict and immutable.

Required fields:

- `schemaVersion: 1`
- stable request, policy, route and decision fingerprints
- closed disposition: `INTERNAL_TOOL`, `CANDIDATE_PREPARED`,
  `HUMAN_HANDOFF`, `CLARIFICATION_REQUIRED`, or `REFUSED`
- closed capability and reason codes
- ordered route pins and bounded fallback pins
- exact privacy, data class, risk and cost ceilings
- `citationsRequired`
- `approvalRequired`
- `providerExecutionAuthorized: false`
- `externalDispatchPerformed: false`

Forbidden fields include raw message, raw research result, contact coordinates,
credentials, tokens, authorization headers and provider response bodies.

