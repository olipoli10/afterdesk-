# Audit Event Contract

Gateway audit events are append-only operational evidence. They contain identifiers, fingerprints, stable classes and bounded measurements; they never contain raw prompts, raw outputs, credentials, authorization headers or provider dumps.

## Event vocabulary

| Event | Required evidence |
| --- | --- |
| `model_gateway.admission.accepted` | operation, tenant, request fingerprint, policy version, ceiling |
| `model_gateway.admission.refused` | operation, tenant, policy key/version when known, refusal class |
| `model_gateway.policy.published` | policy key/version/hash, authorized actor |
| `model_gateway.policy.retired` | policy key/version/hash, actor, reason class |
| `model_gateway.route.certified` | route key/version/hash, evidence fingerprints, actor |
| `model_gateway.route.revoked` | route key/version, breaker generation, actor, reason class |
| `model_gateway.decision.authorized` | operation, attempt ordinal, policy/route hashes, remaining bound |
| `model_gateway.decision.refused` | operation, attempt ordinal, refusal class |
| `model_gateway.attempt.prepared` | attempt, decision, billing provider, hold identity |
| `model_gateway.attempt.dispatched` | attempt, exact route/model, redacted provider correlation |
| `model_gateway.attempt.settled` | attempt, usage identity, measured cost, result-contract disposition |
| `model_gateway.attempt.failed` | attempt, dispatch knowledge, stable error class, HTTP class when safe |
| `model_gateway.attempt.uncertain` | attempt, retained exposure, stable uncertainty class |
| `model_gateway.breaker.opened` | scope, prior/new generation, actor, reason class |
| `model_gateway.breaker.closed` | scope, prior/new generation, actor, reason class |
| `model_gateway.spend.held` | attempt, billing provider, conservative amount |
| `model_gateway.spend.released` | attempt, amount, conclusive non-dispatch evidence class |
| `model_gateway.spend.settled` | attempt, held/measured amounts, usage identity |
| `model_gateway.replay.converged` | logical operation, existing terminal/active identity, zero-new-dispatch proof |

## Correlation and access

Every event carries a stable correlation identifier and timestamp. Tenant-scoped readers may access only their authorized operational evidence. Admin-only certification and breaker events require explicit authorization and are not exposed through ordinary task output.

## Failure rules

- Failure to persist pre-dispatch decision or reservation evidence blocks dispatch.
- Failure to persist a terminal audit event cannot retroactively erase usage or release uncertain exposure.
- Unknown/free-form error text is stored only in an authorized protected diagnostic channel, never in this ordinary event stream.
