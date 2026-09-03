# R37J Provider Failed-Run Evidence Cleanup

## Purpose

Close confirmed Codex Security finding `csf_3bf4140f108a33c61429caab`: no run adjudicated `FAILED` may retain canonical provider evidence written earlier in the same exact lease.
## Requirements

- The expiry transition must match the exact run state and lease token.
- Expiry after the R37F canonical write must clear both canonical evidence columns before spend release.
- Any post-adapter validation failure while the exact lease is still owned must clear both canonical evidence columns before spend release.
- Failed public results and failed durable rows must contain no provider evidence.
- Exact reservations must be released, never settled, on those paths.
- A stale worker must never clear evidence owned by a replacement lease.
- Existing tenant, replay, digest, trusted-clock and no-transport controls must remain intact.
- No provider, credential, customer data, network transport, dependency, lockfile, Prisma schema or migration is allowed.

## Acceptance

- Deterministic PostgreSQL RED reproduces the two-write expiry race.
- Deterministic PostgreSQL RED reproduces validation failure after canonical evidence storage.
- Both cases finish `FAILED`, retain null canonical evidence, release exact spend and use fresh trusted terminal timestamps.
- R37A-R37I regressions, full local suite, typecheck, lint and diff checks pass.
