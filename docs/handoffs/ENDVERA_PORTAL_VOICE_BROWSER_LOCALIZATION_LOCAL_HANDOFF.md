# ENDVERA portal voice — browser/localization local handoff

LANE: Browser + localization certification follow-up

WORKTREE: `C:\dev\nightlexicon-endvera-portal-v1`

BRANCH: `codex/endvera-portal-v1`

BASE SHA: `0c2d2aac3636deab696a72f423733ba3a3643cf1`

SOURCE COMMIT: `e914887` — `fix(portal): make voice certification evidence truthful`

FINAL SHA: the local documentation commit containing this handoff; use `git rev-parse HEAD` when reviewing.

COMMITS:

- `e914887` — truthful browser/reflow harness, fail-closed Webpack forwarding, raw local evidence and regression tests.
- Documentation checkpoint commit containing this file.

TASKS COMPLETED:

- Corrected the build wrapper so `npm run build -- --webpack` actually invokes `next build --webpack` while rejecting unallowlisted or conflicting arguments.
- Replaced pinch-scale 200% evidence with real CSS reflow at a 720 by 500 CSS viewport rendered to a 1440 by 1000 capture.
- Regenerated Chrome and Edge disclosure evidence for EN/FR/ES/TL at 100% and 200%.
- Regenerated canonical-disabled evidence at 360, 390, reduced-motion, desktop and true 200% reflow.
- Corrected browser shutdown so fresh Edge evidence leaves no running process or disposable profile.
- Marked the earlier invalid desktop and pinch-scale evidence as superseded.

TASKS REMAINING:

- Native Tagalog language review.
- Firefox browser proof.
- Safari browser proof.
- Real Audio Intake runtime integration.
- Provider, privacy, cost and latency certification.
- Any Preview, Production or rollout decision.

FILES MODIFIED:

- `.gitignore`
- `eslint.config.mjs`
- `scripts/endvera-visual-audit.mjs`
- `scripts/endvera-voice-interaction-audit.mjs`
- `scripts/vercel-build.mjs`
- `test/endvera-portal-voice-experience.test.ts`
- `test/public-site-release-correction.test.ts`
- `docs/evidence/endvera-portal-voice/README.md`
- `docs/evidence/endvera-portal-voice/browser-localization-certification/` — 57 raw JSON/PNG artifacts plus README
- `docs/handoffs/ENDVERA_PORTAL_VOICE_BROWSER_LOCALIZATION_LOCAL_HANDOFF.md`

TESTS:

- Initial Webpack forwarding RED: 1 failure / 10 passes; then 11/11 PASS after correction.
- Initial true-reflow RED: 1 failure / 5 passes; then 6/6 PASS after correction.
- Browser-close cleanup RED: 1 failure / 6 passes; then 7/7 PASS after correction.
- Targeted portal/voice/release suite: 5 files / 49 tests PASS.
- Full Vitest: 57 files PASS, 1 historical public-site lane guard FAIL; 1,082 tests PASS, 1 guard FAIL. This is not represented as a fully green suite.
- ESLint: PASS after excluding disposable browser scratch profiles from lint scope.
- TypeScript `tsc --noEmit`: PASS.
- Preview build: PASS with `next build --webpack`; 96/96 pages generated and no migration command.
- `git diff --check`: PASS, with line-ending warnings only.

MUTATIONS:

- `build-wrapper-drops-webpack-flag`: RED, then restored to SHA-256 `77D68E321720E8DC62244184B4EA2A6AAE3BA008778C2BD59ACD6DF4519F4A0B` and 11/11 PASS.
- `voice-zoom-falls-back-to-pinch-scale`: RED, then restored to SHA-256 `B4FD87EE6A53292749034CE22D40C13C18FF6C85D30CE170819C5D299EAD3A33` and 7/7 PASS.
- Synthetic readiness facts used for evidence were restored to server-boundary SHA-256 `C1D63BE8320A9FAF2445DF624320BFBC86DAECF69943A2246BEA370A405ECDA0`.

DATABASE: none used.

LOCKFILE: unchanged; expected SHA-256 `0D042AA8171967CED206DA10E1D9966F4CE3C36605B2FE5A95EF9965102E6187`.

PROTECTED REPOS: original NightLexicon, Model Gateway, Audio Intake, public production source and Brain were read-only and must be rechecked by final controller review.

PUSH: none.

DEPLOYMENT: none; no Preview or Production action.

RISKS:

- Chrome/Edge success does not predict Firefox or Safari behavior.
- Mechanical Tagalog layout proof is not linguistic approval.
- No real runtime/provider quality, privacy, cost or latency claim is supported.
- Old superseded artifacts remain in history and must not be cited without the correction note.
- Ignored `.tmp-voice-*` scratch directories from pre-fix evidence runs remain on disk with synthetic browser-profile state. They are untracked and outside lint/build; `git status` has zero entries and no evidence browser process remains active.

BLOCKERS:

- External browser availability for Firefox and Safari.
- Native Tagalog reviewer availability.

REQUESTED NEXT ACTION:

Keep this lane `WAITING FOR DEPENDENCY` for native Tagalog, Firefox and Safari. While those external dependencies are provisioned, the controller may open the separate **Real Audio Intake runtime integration** lane on this local portal candidate, with rollout disabled and no provider traffic, Preview or Production authority.
