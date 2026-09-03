# Implementation Plan: Mobile Store Visual Readiness

## Sequence

1. Inventory current Expo artwork, hashes, dimensions and official store constraints already recorded in R36I.
2. Create a deterministic ENDVERA vector master and render icon, adaptive layers, monochrome mark, splash and favicon through existing workspace tooling.
3. Add a source-contract and pixel-dimension validator before replacing referenced assets.
4. Create bilingual candidate screenshot copy and a local capture manifest for Today, Assistant, Projects, Calendar and approval trust.
5. Render local candidates from synthetic state only and watermark their evidence classification outside the in-app viewport.
6. Run mobile tests, typecheck, lint, Expo Doctor and all-platform local export.
7. Update `submission-gaps.json` narrowly: starter artwork may close only after asset validation; real-device screenshots, approval, signing and store work remain unresolved.

## Scope

- `specs/178-mobile-store-visual-readiness/**`
- `apps/mobile/assets/**`
- `apps/mobile/app.json`
- `apps/mobile/test/mobile-store-visual-readiness.test.ts`
- `release/endvera-construction-v1/**visual**`
- `release/endvera-construction-v1/submission-gaps.json`
- `scripts/render-endvera-mobile-assets.mjs`
- `scripts/validate-endvera-mobile-assets.mjs`
- queue/backlog continuation files

## Gates

- No dependency or lockfile change.
- No provider, credential, customer data or network dependency.
- No claim of final brand approval or real-device capture.
- Mobile tests, typecheck, lint, Expo Doctor, local export and `git diff --check` pass.

