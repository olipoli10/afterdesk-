# Model Gateway v1 — US1 classification evidence (T021–T032)

Date: 2026-08-19

Scope: local-only synthetic classification boundary through T032

Rollout: disabled

External provider traffic: none

Provider or gateway candidate adoption: none

## RED before implementation

1. `test/model-gateway-policy.test.ts` failed because the published-policy resolver did not exist.
2. `test/model-gateway-adapter-contract.test.ts` failed because no synthetic one-attempt adapter existed.
3. `test/model-gateway-classification-contract.test.ts` failed because certified classification response validation was absent.
4. `test/integration/model-gateway-admission.itest.ts` failed on disposable PostgreSQL because admission and dispatch did not exist.

Those failures were observed before the corresponding implementation modules were added.

## Implemented boundary

- The classification request is immutable, content-addressed and limited to the five fields consumed by the frozen classifier contract. An unexpected source field is refused rather than projected.
- Policy resolution accepts only the published `classification` canary, one exact route key/version, an allowed data class, a sufficient privacy posture, unexpired privacy evidence and the frozen operation cost bound.
- Missing, expired, unpublished, contradictory and non-classification facts fail closed with stable refusal classes. No fallback is invented.
- The synthetic adapter checks the exact adapter/provider/intermediary/endpoint/model pin before its one transport call. It has no retry, cache, hedge, fallback or substitution path.
- Admission claims the existing `AiOperation`, reserves account spend, persists the immutable gateway binding, route decision and prepared attempt, and only then returns an authorized dispatch capability.
- Dispatch reloads policy, route, decision, hold and the authoritative `AiOperation` fencing token immediately before the adapter call.
- A changed route is refused with zero adapter calls and the unused hold is released.
- Successful output passes the existing frozen classification schema. Malformed or semantically invalid output is terminally bound as invalid evidence.
- Terminal evidence binds the policy hash, route hash, request fingerprint, provider evidence, output-contract evidence and measured synthetic token/cost facts without storing prompt or response content in ordinary gateway evidence.
- A successful replay returns the existing terminal attempt/evidence reference and performs no second adapter call.
- Two concurrent admissions produce one claimant, one decision, one attempt and one hold.

## Disposable PostgreSQL proof

- Instance: `hwu-integration`
- Address: `127.0.0.1:51214`
- Database: `afterdesk_integration`
- Explicit reset authorization: `ALLOW_INTEGRATION_DB_RESET=1`
- Migration count: 36
- No application database URL was present; the integration isolation guard passed.

The focused US1 PostgreSQL suite passed 6/6 test cases:

1. decision and held spend exist before transport, and successful replay converges without another call;
2. known-policy ineligibility persists a refusal and creates no attempt;
3. retirement between admission and dispatch is rechecked, calls no adapter and releases the hold;
4. malformed output becomes terminal invalid evidence;
5. a stale fencing token calls no adapter;
6. concurrent admission produces one claimant, decision, attempt and hold.

## Named mutation proof

All mutations failed the named guard and were restored before the pristine gates.

| Mutation | Killing proof |
|---|---|
| `adapter-hidden-retry` | one dispatch produced two transport calls; `makes exactly one transport call` failed with `expected 2 to be 1` |
| `gateway-replay-dispatches-twice` | disabling terminal replay convergence changed `replay` to `busy`; the replay test failed before a second call could occur |
| `gateway-dispatch-without-decision` | inserting an adapter call before policy/decision/hold recheck made the retired-route fixture observe one call instead of zero |
| `classification-semantic-validation-bypassed` | repairing an invalid objective inside validation made the semantic-invalid fixture pass incorrectly; the contract test failed |

Post-restoration source SHA-256 anchors:

- `synthetic.ts`: `9E9B3290956A82A3B215170DAB00A19C2BC3DE75BA57D0D1D0CFD73AF31AF438`
- `operations.ts`: `518A6C5E7344E50BD0E0CEBB1869B08886EB7DC4C6FF5CDD78DF2A07D263C5A8`
- `dispatch.ts`: `E4997F6B24790168DAC463C27387D1D5AE59E104F51DC266DA6FC2C239AD016E`
- `evidence.ts`: `F9DD9E267AB621C5A9560697F64519C191A23C39972C4C7C85E59111981082C0`

## Pristine full gates

- Lint: exit 0.
- Typecheck: exit 0.
- Fast suite: 69 files, 1,509 tests passed, 0 failed.
- Disposable-PostgreSQL integration: 32 files, 357 tests passed, 0 failed, 36 migrations.
- `package-lock.json`: unchanged at `0B01B24159591440E08F8F78FAF3C6E17EF5CE293304B773651F69EC7F60A7CD`.

## Boundary at STOP

This proves US1 only through a deterministic synthetic boundary. It does not enable Model Gateway routing, call a provider, adopt a vendor, certify a direct or mediated candidate, implement fallback attempts, or complete provider-attributed `AiUsage`. Those later concerns begin at T033 and beyond. T033 was not started.
