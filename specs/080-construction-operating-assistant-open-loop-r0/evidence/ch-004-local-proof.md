# CH-004 — Disposable PostgreSQL local workflow proof

## Verdict

`READY_FOR_FOUNDER_OWNED_INVOICE_READINESS_LOOP_TEST`

## Scenario observed locally

The synthetic Laval dossier moved through the exact economic loop:

1. an authorized work-finished report created one OpenLoop;
2. missing written approval and supporting evidence remained visible;
3. conflicting approval claims created a durable contradiction without overwriting either claim;
4. the correct claim and evidence were explicitly verified;
5. the loop reached `READY_TO_INVOICE` only when every policy requirement was satisfied;
6. a restart produced the same projection, history and snapshot hash;
7. duplicate/replayed input produced no second canonical effect;
8. revoking evidence regressed readiness;
9. a follow-up was prepared as `PREPARED_UNSENT` with transport authority false;
10. a field-worker projection exposed no financial amount.

## Measured results

- project/workspace association accuracy: 100%;
- canonical loops for equivalent reports: 1;
- duplicate canonical effects: 0;
- replay canonical effects: 0;
- wrong-project evidence admitted: 0;
- cross-workspace reads admitted: 0;
- field-worker financial leaks: 0;
- invented facts: 0;
- provider invocations: 0;
- external transports: 0.

## Validation

- focused policy, bridge and schema tests: 23 passed;
- relevant Construction regressions: 110 passed, 2 skipped;
- full unit suite: 1,206 passed, 2 skipped;
- focused PostgreSQL proof: 9 passed;
- serialized PostgreSQL integrations: 106 passed;
- fresh disposable migration chain: 35 migrations applied;
- mutations: 37/37 killed and byte-restored;
- lint: PASS;
- typecheck: PASS;
- local Next.js 16.2.12 Webpack build: 99/99 pages;
- git diff check: PASS;
- package-lock: unchanged.

The local build used a synthetic local-only secret and the repository's preview-disabled storage mode. No Preview environment was deployed.

## Honest ceiling

This proves code, persistence and synthetic local behavior. It does not prove founder usability, customer value, a provider connector, delivery, product-market fit or Verified-E2E. The next meaningful proof is one founder-owned invoice-readiness run in the integrated one-screen workflow, followed by design-partner discovery.
