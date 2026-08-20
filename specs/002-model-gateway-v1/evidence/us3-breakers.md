# US3 — Operator breaker integrity

## Scope

Local-only evidence for T044–T052. The tested route is synthetic and the
database target is the named disposable local integration database. No
provider credential, gateway candidate, Preview, Production, shared database
or external provider route was invoked.

## Green evidence

| Gate | Result |
| --- | --- |
| Closed policy/route/model/provider scope unit tests | PASS |
| Disposable PostgreSQL CAS and append-only breaker events | 2 PASS |
| Disposable PostgreSQL admission/recheck/frozen-response proof | 9 PASS |
| Admin mutation-boundary authorization source test | PASS |
| Fast suite | 1535 PASS |
| Lint / typecheck | PASS / PASS |

The dispatch proof opens a route breaker after the adapter has begun work. The
arriving response is reconciled only under the admitted route and decision;
there is no re-admission or silent reroute. Before dispatch begins, any open
or generation-changed breaker refuses the attempt and releases only an
undispatched hold.

## Named mutation proof

| Mutation | Named guard | Result after mutation | Restoration |
| --- | --- | --- | --- |
| `gateway-stale-breaker-generation-wins` | current-generation comparison plus generation-CAS result check | RED: a stale close resolved as generation 2 instead of rejecting, so the exact stale-CAS integration assertion failed | `breakers.ts` restored byte-exactly; SHA-256 `17AD2055E1AB02B7C058A22D3723A4A57DFC2476B70899C93BC269758CA2990C` before and after |

The mutation deliberately disabled both generation checks: the stale input
comparison and the failed `updateMany` result check. Mutating only the latter
remained green because the earlier guard independently refused the stale input;
that redundancy is retained and is not presented as the named-mutation proof.

## Stop / resume boundary

T052 is complete. The next unchecked surface is US4 exact-route privacy
(T053–T060). This proof does not certify a real provider, a gateway vendor,
OpenRouter, Preview deployment or Production readiness.
