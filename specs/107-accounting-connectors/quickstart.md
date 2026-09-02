# R27 Quickstart Validation

## Scenario A — Account authority

1. Prepare synthetic QuickBooks and Xero disabled account plans.
2. Race and replay preparation; assert one account and decision per identity.
3. Refuse field, outsider, stale, cross-workspace and secret-bearing commands.
4. Revoke locally and refuse subsequent observation/draft work.

## Scenario B — Observation and matching

1. Create synthetic R21 open receivables in CAD.
2. Admit exact invoice/payment observations through a trusted local adapter.
3. Replay/race and prove one observation/effect.
4. Preserve unmatched, partial, overpayment, stale and conflicting observations.
5. Prove ambiguity creates review with zero settlement write.

## Scenario C — Exact prepared operations

1. Prepare an invoice from one `READY_TO_INVOICE` dossier.
2. Inspect exact recipient, currency, line items, tax, evidence and hash.
3. Prepare an exact reconciliation against one admitted payment.
4. Approve exact versions; refuse altered, stale and repeated approval.
5. Assert `externalWrite=false` and `externalEffectCount=0` throughout.

## Scenario D — Shared cockpit and restart

1. Inspect owner/admin account, observation, conflict and draft projections.
2. Confirm the field projection has no financial/accounting detail.
3. Restore queued commands after mobile restart with stable identities.
4. Disconnect/reconnect PostgreSQL and confirm identical canonical state.

## Gates

- R27 and relevant R10/R11/R16/R17/R21 tests;
- fresh disposable PostgreSQL migration and concurrency/restart proof;
- full mobile tests, lint, typecheck, Expo Doctor and local export;
- root lint/typecheck and Next.js Webpack build;
- Spec Kit analyze, diff, lockfile and zero-provider/write audits.
