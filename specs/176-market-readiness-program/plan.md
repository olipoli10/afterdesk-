# R36G-R36K Market Readiness Program — Implementation Plan

## Decision

Build the largest useful credential-free slice before any external account is needed. Keep one canonical release definition and layer five deterministic validators over it. Do not add a second release system or a second mobile app.

## Technical context

- Web: existing Next.js App Router application.
- Mobile: existing Expo Router application in `apps/mobile`, shared by iOS and Android.
- State: existing PostgreSQL/Prisma operating core; no schema change is needed for local release preparation.
- Release baseline: R35 deterministic package and R36 internal synthetic E2E.
- External boundaries: no provider, secret, account, signing, upload, deployment, store or customer access.

## Constitution check

- **Owned outcome**: one release decision identifies the next responsible owner for every blocker.
- **Closed world**: configuration names and allowed profiles are explicit; unknown keys and inflated claims fail closed.
- **Authorization/privacy**: credential values and external actions are structurally excluded.
- **Durability**: readiness artifacts are deterministic and source-bound.
- **Verification**: local preparation is separate from signed, deployed, published and observed evidence.
- **Economics**: no paid build or provider call occurs; future cost-bearing actions remain gated.
- **Incremental evolution**: reuse R35, Expo and the public Web surface; no dependency or schema change.

## Work sequence

1. **R36G mobile build preparation**
   - Add a credential-free `eas.json` with explicit `local-simulator`, `internal-preview` and `store-candidate` profiles.
   - Add a typed validator that cross-checks `app.json`, R35 identity and boundary flags.
   - Add targeted tests proving credentials, submit automation, remote update channels and identity drift are refused.
2. **R36H Web production preparation**
   - Read installed Next.js production/environment guidance.
   - Freeze required variable names, route inventory, health/rollback prerequisites and value-free validation.
   - Validate public/legal/support/auth path coverage without deploying.
3. **R36I store compliance pack**
   - Create canonical Apple and Google questionnaires plus bilingual shot lists.
   - Cross-check runtime permissions, disclosures, account deletion and support routes.
   - Preserve legal review, accounts and real screenshots as blockers.
4. **R36J observability and support**
   - Define redacted events, SLO candidates, incident ownership, rollback triggers and support handoff.
   - Provide disabled adapters only; no external endpoint or secret.
5. **R36K unified readiness gate**
   - Combine all target reports into one deterministic artifact.
   - Require exact evidence labels and source hashes.
   - Emit the earliest actionable blocker per target and keep R37 behind exact authority.

## Files and boundaries

Primary implementation may touch:

- `apps/mobile/eas.json`
- `apps/mobile/src/lib/release.ts`
- `apps/mobile/src/lib/store-build.ts`
- `apps/mobile/test/store-build.test.ts`
- `release/endvera-construction-v1/**`
- `scripts/*endvera*readiness*.mjs`
- `src/lib/construction-operating-assistant-r36g-r36k/**`
- `test/construction-operating-assistant-r36*.test.ts`
- `docs/release/endvera-construction-v1/**`
- `specs/176-market-readiness-program/**`
- the canonical backlog, continuation queue and proof files.

No Prisma schema/migration, dependency, root lockfile, mobile lockfile or existing accepted spec is changed.

## Validation strategy

- RED first for each release.
- Targeted Vitest suites for mobile and root contracts.
- Existing R35 release-package suite after every release-definition change.
- Mobile lint/typecheck and root typecheck when implementation code changes.
- `git diff --check` and secret-shaped material scan.
- Maximum one full build at R36K unless a product code change requires earlier proof.

## Stop criteria

Stop only if every remaining critical-path item requires an external account, credential, spending, provider, customer data, public deployment, store submission or irreversible action. A locally fixable test or design defect is not a stop.

## Source research

The build profile shape follows current Expo documentation: `eas.json` belongs beside the app package in a monorepo; production profiles describe store builds; Android App Bundle is the store default. This plan deliberately omits all submit profiles and commands.
