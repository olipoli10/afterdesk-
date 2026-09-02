# Implementation Plan: R35 Release Packaging

## Technical context

- TypeScript strict, Next.js 16 App Router, Expo 57 shared iOS/Android, Node ESM scripts, Zod and Vitest.
- Existing R30 privacy controls, R33 cross-platform parity and R34 public/commercial registry.
- Existing Expo identity/assets in `apps/mobile/app.json`; no EAS/store configuration or signing credentials.
- No database migration, dependency or lockfile change is expected.

## Architecture

1. Add a closed R35 registry for targets, environment modes, identities,
   readiness states, public paths and forbidden release actions.
2. Add strict contracts for environment presence-only reports, asset inventory,
   bilingual listing metadata, privacy disclosures and canonical release
   manifests.
3. Add a non-networked Node generator/validator that hashes tracked inputs,
   rejects path escape and secret material, and writes one deterministic local
   manifest under `release/endvera-construction-v1`.
4. Make Expo identity/build metadata explicit without adding signing, updates,
   owner, project, account or credential references.
5. Add bilingual store-copy and privacy-disclosure source artifacts derived
   from R30/R34 closed claims.
6. Add public Construction support/status and mobile Settings release
   projections that reveal paths and build identity, never environment values.
7. Add operator runbooks for environment preparation, local Web/mobile build,
   evidence collection, later promotion, incident response and rollback.
8. Prove deterministic regeneration, exact hashes, boundary booleans, claim
   parity, missing/mutated input refusal and no external effect.

## State boundaries

| Concern | Authority |
|---|---|
| Canonical product state | existing PostgreSQL-backed R0-R34 services |
| Privacy controls | R30 |
| Web/mobile capability parity | R33 |
| Commercial/public claims | R34 |
| Local package metadata | R35 tracked artifacts |
| Secret values and signing material | absent / later external authority |
| Provider/store/deployment observation | unavailable |

## Constitution Check

- **Canonical state**: PASS — packaging references product contracts; it does not fork runtime state.
- **Closed-world capability**: PASS — targets, modes, identities, artifacts, states and refusal reasons are registered.
- **Secret safety**: PASS — only variable names/presence states are serializable.
- **Path safety**: PASS — package inputs are normalized repository-relative allowlisted paths.
- **Claim honesty**: PASS — local readiness is distinct from signed, uploaded, store or production readiness.
- **Determinism**: PASS — canonical JSON and sorted hashes bind identical inputs.
- **External effects**: PASS — generator and validator are local filesystem reads/writes only.

No constitutional exception is required.

## Validation

- registry, identity, environment, listing, disclosure and manifest unit gates;
- mutation gates for secrets, paths, assets, claims and readiness inflation;
- R30/R33/R34 regressions and root/mobile lint/typecheck/tests;
- Expo Doctor and local all-platform export with synthetic local compile values;
- Next.js Webpack build with local development values;
- Spec Kit Analyze, deterministic double-generation, diff/lockfile/effect audits.

## Delivery and continuation

Commit R35 coherently, mark it DONE, promote R36 Internal E2E and continue
without an intermediate founder prompt. No provider, customer data, signing,
external transport/write, EAS/store/Vercel action, deployment, push, Preview or
Production.
