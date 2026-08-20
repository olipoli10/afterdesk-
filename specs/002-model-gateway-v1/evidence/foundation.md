# Model Gateway v1 — Foundation evidence (T007–T020)

Date: 2026-08-19

Scope: local-only foundation through T020

Rollout: disabled

External provider traffic: none

Provider or gateway candidate adoption: none

## RED evidence

The contracts and persistence tests were written and observed failing before implementation.

1. `test/model-gateway-types.test.ts`, `test/model-gateway-registry.test.ts` and `test/model-gateway-evidence.test.ts` first failed because the new server-only Model Gateway modules did not exist.
2. The first evidence-helper implementation exposed two honest test/contract defects: the fixture fingerprint was malformed, and the protected-content key detector did not reject camel-case `rawPrompt`. The fixture and the closed detector were corrected before GREEN.
3. `test/integration/model-gateway-immutability.itest.ts` first failed 4/4 against the inherited 35-migration database because the seven Model Gateway tables, relations and database invariants did not yet exist.
4. `test/integration/model-gateway-operations.itest.ts` first failed because its typed Model Gateway database support module did not exist.
5. After the additive migration, two integration fixtures reused the same route key/hash across independent tests. This was classified as a fixture-isolation defect, corrected with unique facts, and not counted as product GREEN.

## Implemented foundation

- Closed operation/data/privacy/error/refusal/result vocabularies.
- Canonical JSON and SHA-256 fingerprints with protected content references.
- Content-free provider failure evidence.
- Closed operation, adapter, policy and route registries.
- Server-only one-attempt adapter contract and deterministic call-counting provider fixtures.
- Additive Prisma schema for policies, routes, logical operations, decisions, attempts, breakers and breaker events.
- Optional unique association from a gateway attempt to the existing account spend hold and usage record.
- Database uniqueness, historical-lineage, immutability and append-only constraints/triggers.
- A database guard preventing an attempt without a persisted route-authorized decision.
- Serializable repository primitives for immutable operation bindings, convergent decision replay and attempt creation.

## Migration proof

- Migration: `20260819213000_model_gateway_v1`
- Target: disposable PostgreSQL instance `hwu-integration`, database `afterdesk_integration`
- Migration count after application: 36
- No `prisma db push`.
- No shared or Production database access.

## GREEN evidence

Targeted foundation:

- Pure contract suites: 3 files, 9 tests passed.
- PostgreSQL immutability and operation suites: 2 files, 6 tests passed.
- Typecheck: passed.

Pristine full gates after implementation:

- Lint: passed, exit 0.
- Typecheck: passed, exit 0.
- Fast suite: 65 files, 1,494 tests passed.
- Disposable-PostgreSQL integration: 31 files, 351 tests passed.
- Integration migrations: 36.

## Boundary at STOP

This proves the immutable foundation only. T021 and later admission, dispatch, spend, breaker, privacy and conformance behavior are not implemented. Rollout remains disabled, no external adapter is callable, and no vendor/provider route has been selected or adopted.
