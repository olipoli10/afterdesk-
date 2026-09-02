# R28 Quickstart Validation

## Scenario A — Policy lifecycle

1. Create a fail-closed draft from the default registry.
2. Add synthetic internal, approval-required and prohibited rules.
3. Activate exact version/hash; replay and race activation.
4. Create a successor draft and prove the active version is immutable.
5. Revoke locally and prove subsequent evaluations fail closed.

## Scenario B — Point-of-use evaluation

1. Evaluate a low-risk reversible internal reminder.
2. Evaluate an external message and require exact approval.
3. Evaluate payment, legal, credential and deletion actions and prohibit them.
4. Refuse unknown action, missing context, stale source and cross-workspace input.
5. Apply overlapping rules and prove the strictest outcome wins.

## Scenario C — Exact decisions

1. Inspect exact target, reason, consequences, expiry and payload hash.
2. Approve an approval-required evaluation with exact versions.
3. Refuse altered, stale, expired, repeated and unauthorized approval.
4. Prove a prohibited evaluation never enters the approval path.
5. Assert zero provider, transport, spend and external effect throughout.

## Scenario D — Shared cockpit and restart

1. Inspect owner policy lifecycle and pending decisions.
2. Inspect office policy summary and authorized decision surface.
3. Confirm field projection exposes only its own coarse result.
4. Restore queued commands after mobile restart with stable identities.
5. Disconnect/reconnect PostgreSQL and confirm identical history and active state.

## Gates

- R28 and relevant R10/R11/R16/R17 tests;
- fresh disposable PostgreSQL migration and concurrency/restart proof;
- full mobile tests, lint, typecheck, Expo Doctor and local export;
- root lint/typecheck and Next.js Webpack build;
- Spec Kit analyze, diff, lockfile and zero-provider/effect audits.
