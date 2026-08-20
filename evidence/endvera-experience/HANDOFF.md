# ENDVERA public-site V7 — local handoff

## 1. Verdict

**GO LOCAL — review only. NO-GO push, Preview or Production.**

The public-site candidate is materially clearer, visually coherent with the
ENDVERA identity, mobile-safe in the required capture matrix and truthful
about A2 and human verification. It is not production evidence.

- Worktree: `C:\dev\nightlexicon-publicsite-v7`
- Branch: `feat/public-site-simplicity-v7`
- Expected and verified base: `904a8138fe4c2366cc3d07f4897f11e1b49bea33`
- Implementation commit: `4b383560f3930c5dcbdd0d4a9fe895ab33801c33`

## 2. Completed

- Replaced the public identity, metadata, app icon and social-card identity
  with ENDVERA and the amber seam.
- Rewrote the opening to say, within five seconds: bounded workflow in;
  coordination across AI, software, browser work, authorized systems and
  human judgment; human verification; finished documented result out.
- Positioned A2 as a cited site guide and preserved the accepted scene and
  motion authority. No new scheduler or animation loop was added.
- Improved narrow-screen header targets, critical mono-copy sizing, wrapping,
  story dwell, A2 clearance and result-card clearance.
- Preserved a complete static reduced-motion composition.
- Applied the ENDVERA name to the explicit public Academy projection while
  leaving the shared worker curriculum unchanged.
- Captured before/after review evidence at desktop, 390 px, 360 px, French,
  Tagalog and reduced motion, plus later solution/engine/result scenes.

Not completed by design:

- Portal design: excluded by the explicit Block 1 mandate.
- Backend, Prisma, gateway, HumanWorkUnit, auth behavior and migrations:
  excluded.
- Preview, Production, push and Brain mutation: forbidden.

## 3. Files

Implementation and narrative:

- `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/manifest.ts`
- `src/app/_v7/simplicity-acts.tsx`
- `src/app/_home/a2-concierge.tsx`
- `src/app/_home/assembly-experience.tsx`
- `src/app/_home/home-assembly.module.css`
- `src/components/logo.tsx`, `src/components/public-shell.tsx`
- public metadata, public authentication-page labels, public workers pages,
  public UI components and public i18n dictionaries under `src/app`,
  `src/components` and `src/lib/i18n`
- `src/lib/academy/public.ts`, `src/lib/site.ts`

Proof:

- `test/public-site-endvera-experience.test.ts`
- updated public-site brand expectations in the three existing public tests
- `scripts/capture-local-publicsite.mjs`
- `evidence/endvera-experience/before/*`
- `evidence/endvera-experience/after/*`
- `evidence/endvera-experience/README.md`

The implementation commit is the authoritative exact file list.

## 4. Tests and environment

- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- Environment: Node `v26.2.0`, npm `11.13.0`, Next `16.2.12`, Windows.
- Concerned public/Academy suite: **133 PASS / 0 FAIL**.
- New candidate invariant suite: **12 PASS / 0 FAIL**.
- Full Vitest suite: **1,047 PASS / 1 FAIL** across 54 files.
- Existing failure: `test/public-site-cohesion.test.ts` expects exactly one
  `PublicShell` in `src/app/how-it-works/page.tsx`; that page already had a
  bespoke header and zero `PublicShell` at the verified base. It was not
  changed to manufacture a green result.
- Local build command reached successful Next compilation and TypeScript, then
  stopped during page-data collection because the existing auth guard requires
  `BETTER_AUTH_SECRET` in a production-mode build. No secret was invented,
  displayed, copied or changed, so a complete build is **not proven**.
- `git diff --check`: clean after final documentation correction.
- `package-lock.json` stayed unchanged at SHA-256
  `0D042AA8171967CED206DA10E1D9966F4CE3C36605B2FE5A95EF9965102E6187`.

## 5. Visual evidence and red-team result

The exact CDP viewport measurements produced equal viewport and document
widths for every required capture: 1440/1440, 390/390 and 360/360. At 390 px,
the English and Tagalog result scenes retain 17.22 px between the sticky
heading and result card. Required mobile header controls measure 44 px high.

- Five-second clarity: PASS.
- Density and readability: PASS for review.
- Brand coherence: PASS for the public surface, pending brand/legal review.
- Mobile and long-language wrapping: PASS at the tested sizes.
- Reduced motion: PASS as a complete static composition.
- Product truth: PASS for review; no live autonomy or connector claim added.
- Accessibility: improved, not independently certified.

Honest score: **public site 8.8 / 10 for local review**. Portal score: **not
evaluated — outside this lane**.

## 6. Mutations and restoration

1. Brand-retirement invariant: changed the English ENDVERA heading back to
   AfterDesk; the targeted suite failed on retired-brand and five-second-copy
   checks. Restored exactly. `src/lib/i18n/v7-acts.ts` pre/post SHA-256:
   `ECD80DE6211917905DF73FEDCEAB40F1C39566CD234C456408494F681182E59D`.
2. Result-clearance invariant: changed mobile result padding from `0.10` back
   to `0.04`; the named clearance test failed. Restored exactly.
   `src/app/_v7/simplicity-acts.tsx` pre/post SHA-256:
   `45F2558A3B3B8B8C8511A7E19D19BFDDCDF317B30D7F00BEB77E7E00E91824DF`.

Additional RED tests were observed before the hero dwell, Act 2 A2 lane,
result clearance, mobile targets, amber identity and public Academy projection
fixes. All targeted tests are green after implementation.

## 7. Remaining risks and limits

- A complete production-mode local build still needs a controller-approved,
  non-production auth build environment. This lane did not have that proof.
- The one pre-existing cohesion failure remains and should be handled as a
  separate public-shell task, not hidden inside this design candidate.
- The public name cutover, including legal/public protocol wording, needs a
  human brand/legal review before adoption.
- Screenshots prove local rendering only; they do not prove Preview or
  Production behavior.
- A2 remains a bounded guide with approved answers and citations. This work
  does not establish a live model connection, autonomous execution or live
  connectors.

## 8. Explicitly untouched

- No push, Preview, deploy, redeploy, rollback or Production action.
- No Brain write.
- No package install or lockfile change.
- No Prisma, database, migration, backend, auth behavior, gateway or
  HumanWorkUnit change.
- No portal design or protected worker curriculum rewrite.
- `C:\dev\nightlexicon` remained at
  `0bb3a365951485615537e38533b48b391557e691` with its pre-existing untracked
  files unchanged.
- `C:\dev\nightlexicon-publicsite-endvera` remained clean at
  `fb3b02d0fe65c49bcac1e10f238c223b167177b5`.

## 9. Controller action

Review implementation commit `4b383560f3930c5dcbdd0d4a9fe895ab33801c33`
beside the capture matrix. If it is accepted, the Brain controller should
record the candidate SHA and decide how to transplant it onto the official
ENDVERA lineage. A complete local build should be rerun only with the approved
non-production auth environment. Do not deploy this branch directly.

STOP.
