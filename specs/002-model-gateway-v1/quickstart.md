# Validation Quickstart: Model Gateway v1

This guide defines the evidence sequence for implementation. It does not authorize Preview or Production rollout.

## 1. Preflight

- Confirm the feature worktree and branch.
- Record HEAD, Git status and lockfile hash.
- Confirm protected worktrees are unchanged.
- Confirm the PostgreSQL target is the disposable integration database before any migration.
- Keep classification gateway rollout hard-disabled.

## 2. Existing baseline

Run the repository's established lint, typecheck and fast-test commands before feature edits. Record inherited failures exactly; do not relabel them as gateway failures.

## 3. RED contracts first

Add targeted tests for:

- closed operation/policy/route registries;
- immutable canonical hashes;
- privacy evidence expiry and exact-path matching;
- no decision/no hold/no dispatch;
- one adapter call per attempt with hidden retries disabled;
- uncertain spend retention;
- replay/fencing/concurrency;
- breaker generation and revocation;
- content-free audit events;
- exact classification compatibility.

Observe each RED before the minimal implementation.

## 4. Real persistence proof

Apply additive migrations only through the repository's migration workflow against disposable PostgreSQL. Run the complete gateway integration suite for decisions, attempts, spend holds, breakers, replay, concurrency, immutability and cross-tenant rejection.

Forbidden shortcuts include `prisma db push`, a shared database, a mocked transaction presented as DB proof, and mutation of an already-applied migration.

## 5. Adapter conformance

Run the shared harness in this order:

1. synthetic adapter;
2. current direct classification route;
3. gateway-mediated candidate in an explicitly authorized non-production evidence environment.

Record each route separately. Disable SDK/gateway retries and prove the hidden-retry and silent-substitution mutations. A passing candidate remains a bake-off result, not an adoption decision.

## 6. Classification compatibility

Compare the migrated direct adapter to the pre-gateway classification contract:

- same authorized input projection;
- same prompt and output schema during migration;
- same caller-visible result/failure semantics;
- no extra dispatch on replay, shadow policy evaluation or observability;
- exact provider/model evidence retained.

Shadow policy evaluation performs zero external calls.

## 7. Full pristine gates

On the restored final source:

- run lint;
- run typecheck;
- run the complete fast suite;
- run disposable-PostgreSQL integration;
- run production-like build against only the disposable database when the repository build contract requires it;
- execute all named mutations and restore them byte-exactly;
- verify lockfile and protected repository fingerprints;
- run `git diff --check`.

## 8. Release evidence

The local release report must identify exact commits, migrations, tests, mutation kills, route profiles, policy hashes, privacy evidence status, known unknowns and rollback controls. It must say explicitly:

- classification only;
- rollout remains off unless separately authorized;
- no candidate has been adopted merely by passing conformance;
- quality, cost advantage and reliability are unknown until measured;
- no Preview or Production action occurred.
