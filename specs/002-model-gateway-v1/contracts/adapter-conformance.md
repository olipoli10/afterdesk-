# Adapter Conformance Contract

Every synthetic, direct-provider and gateway-mediated adapter must pass the same harness. Passing establishes behavioural conformance only; it does not adopt or certify a vendor for production.

## Required behaviour

1. Execute exactly one external attempt per envelope.
2. Disable provider SDK retries, gateway retries, hidden fallback, hedging and model substitution.
3. Dispatch only the exact adapter, endpoint and model pinned in the envelope.
4. Return dispatch knowledge separately from provider/business failure.
5. Preserve missing usage as unknown rather than zero.
6. Redact secrets, raw prompts, raw outputs and unsafe provider payloads from ordinary logs/errors.
7. Respect the supplied abort signal without claiming that a dispatched request was not billed.
8. Never choose policy, reserve spend, evaluate fallback or accept a result contract.
9. Produce stable evidence references and normalized error classes.
10. Remain tenant-agnostic except for the already-authorized bounded envelope.

## Shared fixtures

The harness covers:

- valid certified classification response;
- malformed response and output-contract rejection;
- provider refusal;
- rate limit;
- authentication failure;
- timeout before conclusive dispatch;
- abort before dispatch;
- dispatch followed by unknown outcome;
- duplicate replay and concurrent claim;
- secret/content redaction;
- exact route/model pinning;
- hidden-retry mutation;
- silent-model-substitution mutation;
- usage absent and usage measured.

## Evidence matrix

Results remain separated by exact route profile and dimension: contract, privacy evidence, dispatch semantics, accounting, latency, reliability and output quality. No composite score may hide a safety failure. Quality, cost advantage and reliability remain `UNKNOWN` until measured by the authorized bake-off.

## Release condition

The direct classification adapter must pass before its current call site can be migrated. A gateway-mediated candidate must pass independently before it can enter a published route profile. Neither result alone enables rollout.
