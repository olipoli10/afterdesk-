# Implementation Plan: Permissioned Calendar Connector Foundation

## Summary

R23 reuses the R3 connector account/grant/operation schema, R16 permission
center and R17 protected mobile outbox. It adds a Microsoft request builder,
normalizes Google and Microsoft behind strict shared contracts, stores only
non-secret calendar-link fingerprints where required, and exposes one
provider-neutral web API plus one shared native cockpit. Provider execution
remains impossible in this release.

## Technical Context

- Next.js 16 App Router and TypeScript strict mode;
- Prisma/PostgreSQL with forward-only migrations only;
- Expo/React Native shared iOS and Android application;
- Zod closed-world public contracts;
- Vitest unit/mobile tests and serialized disposable-PostgreSQL integration;
- no dependency or provider SDK addition.

## Constitution Check

- Canonical PostgreSQL state remains authoritative.
- Model output never grants connector authority.
- Workspace membership and role are checked server-side.
- Provider scopes are least-privilege and versioned.
- Secret values remain outside PostgreSQL, API, audit and mobile state.
- Every write is idempotent, concurrency-safe and reconstructible.
- External transport and automatic consumers remain disabled.
- Existing R3/R16/R17 engines are composed, not duplicated.

## Structure

- `src/lib/construction-operating-assistant-r23/`: shared provider contracts,
  registry, Google/Microsoft adapter preparation and response classification;
- `src/server/construction-operating-assistant-r23/`: role-safe cockpit,
  prepare/revoke orchestration and deterministic sync/write preparation;
- `src/app/api/endvera/v1/mobile/calendar-connectors/`: protected API;
- `apps/mobile/src/`: strict parser, persistent commands and owner cockpit;
- `prisma/`: additive external-event fingerprint link only if required by the
  executable mapping contract;
- `test/`: unit, mobile and real-PostgreSQL refusal/recovery proof.

## Delivery Sequence

1. Freeze provider-neutral schemas, scope registry and refusal taxonomy.
2. Prove RED for Microsoft support, closed-world parsing and zero transport.
3. Implement deterministic provider request preparation with no executable
   client.
4. Add role-safe PostgreSQL orchestration, concurrency and revocation proof.
5. Add shared iOS/Android cockpit and restart-safe commands.
6. Run proportional gates, close R23 and immediately advance R24.

## Gates

- R23 unit, PostgreSQL and mobile tests;
- R3, R13, R16 and R17 relevant regressions;
- root/mobile lint and typecheck;
- Prisma format, validate, generate and fresh forward migration replay;
- full mobile suite and Next.js Webpack build;
- `git diff --check` and root/mobile lock hashes;
- zero provider/network/customer/push/deployment evidence.
