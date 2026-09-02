# R23 Quickstart Validation

## Preconditions

- Campaign worktree and disposable local PostgreSQL only.
- Providers, credentials, OAuth, network, customer data, deployment and store
  actions disabled.
- Forward migration only; never use `prisma db push`.

## Scenario A — Least-privilege preparation

1. Create synthetic owner, field worker, workspace and project.
2. Prepare Google read-only and Microsoft read/write plans.
3. Replay and race each command; assert one account/operation per provider.
4. Refuse stale, unknown-provider, field, outsider and cross-workspace variants.

## Scenario B — Deterministic provider envelopes

1. Use synthetic connected authority without any real credential.
2. Build Google and Microsoft read, create and update envelopes.
3. Assert exact scopes, notification suppression, canonical fingerprints and
   preconditions.
4. Classify expired cursor, stale remote state, authorization, throttle and
   outage responses without transport.

## Scenario C — Revocation and restart

1. Revoke one provider concurrently and replay the exact command.
2. Verify grants and opaque references are cleared atomically.
3. Verify the other provider remains unchanged.
4. Reconnect to PostgreSQL and verify exact revoked projection.
5. Refuse further sync/write preparation for the revoked provider.

## Scenario D — Shared native cockpit

1. Parse the two-provider owner projection.
2. Prepare and revoke through protected outbox commands.
3. Restart the mobile session; assert byte-identical pending identity.
4. Verify field and cross-workspace access receives no management state.

## Gates

- R23 unit, integration and mobile tests;
- relevant R3/R13/R16/R17 regressions;
- full mobile suite;
- root/mobile lint and typecheck;
- Prisma history and fresh forward migration replay;
- Next.js Webpack build;
- `git diff --check` and lockfile hashes.
