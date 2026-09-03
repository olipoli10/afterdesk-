# R37K Provider Route Absence Guard

## Purpose

Make the current no-provider authority executable: local synthetic provider-control internals must remain unreachable from application routes, server actions and background consumers until a later exact authorization changes the boundary.

## Requirements

- No application route, API handler, server action, job or worker may import R37 execution internals.
- R37 provider-control runtime code may not call network transports or read credentials/environment secrets.
- No R37 request may become dispatchable or credential-resolved.
- The explicit observed-provider request function must remain fail-closed.
- The guard must inspect the actual source tree, not a curated fixture.
- Any future authorized provider route must deliberately update this accepted contract and its tests; silent exposure fails.
- No provider, credential, customer data, network transport, dependency, lockfile, Prisma schema or migration is allowed.

## Acceptance

- RED proves a representative public-route import and a representative network/credential mutation are rejected.
- The pristine tree passes the complete source-boundary guard.
- Existing R37 provider-control tests and proportional local gates remain green.
