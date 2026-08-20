# ENDVERA portal V1 — local handoff

Date: 2026-08-20
Lane: `codex/endvera-portal-v1`
Worktree: `C:\dev\nightlexicon-endvera-portal-v1`
Base production source: `fb3b02d0fe65c49bcac1e10f238c223b167177b5`
Implementation commit: `bc34fd7fe744aa908f2582d4474e7b514ac00609`

## Verdict

GO LOCAL for design review. NO-GO for push, Preview or Production until an authenticated test account is used to verify every real client state and the legacy V7 lane guard is reconciled by its owner.

## Delivered

- ENDVERA onyx/graphite/amber login and client registration.
- Visible EN/FR/ES/FIL selector with localized authentication, dashboard and A2 intake copy.
- Language changes preserve the already validated internal post-login destination.
- Authenticated ENDVERA shell with workflow-first navigation, localized labels and responsive status overview.
- A2-led request surface and large thinking box using the existing canonical A2 sprite geometry.
- Existing authenticated intake and task-submission server actions remain the only execution boundary.
- Honest product boundary: A2 structures intake; an operator confirms fit, scope, timing and fixed price before work begins.
- Readable ivory document surfaces for existing task-detail and standing-capacity screens inside the night shell.
- Reduced-motion rules freeze portal motion without hiding content.
- Read-only Chrome DevTools visual-audit runner covering routes, languages, overflow, error overlays, small text and touch targets.

## Visual evidence

Live public audit refresh at 390 px:

- 39 sitemap routes × 4 languages = 156 rendered combinations.
- 156/156 HTTP 200; zero horizontal overflow; zero runtime error overlays.
- 75 `html lang` mismatches are exactly the 25 Academy course-detail pages in FR/ES/FIL. Their body content is intentionally English in the current repository policy; this is not full translation.
- Text below 12 px remains concentrated in the Academy curriculum and course-detail UI. This prevents a truthful “everything is perfect” verdict for the whole live site.

Candidate audit:

- Real `/login` and `/register`, plus exact dashboard/intake component fixtures.
- Desktop 1440, mobile 390, mobile 360 and `prefers-reduced-motion: reduce`.
- Four languages, zero HTTP/runtime/overflow failures.
- Final 360 audit: zero visible text below 12 px.
- The temporary fixture routes were deleted before commit.

Evidence directories:

- Before live: `C:\Users\oliro\.codex\visualizations\2026\08\20\endvera-portal-v1\before-live-refresh`
- Before portal: `C:\Users\oliro\.codex\visualizations\2026\08\20\endvera-portal-v1\before-portal`
- After candidate: `C:\Users\oliro\.codex\visualizations\2026\08\20\endvera-portal-v1\after-candidate`

## Verification

- Portal contract: 8/8 PASS.
- Full suite: 1,051 PASS / 1 FAIL. The only failure is the historical `public-site-endvera-v7` scope guard, which compares every branch to fixed base `1b37f77` and intentionally rejects all portal files. It was not weakened or modified.
- TypeScript: PASS.
- ESLint: PASS.
- `git diff --check`: PASS.
- Local Next 16 Webpack build: PASS using process-only, explicitly fake R2 placeholders. No real secret was read or changed and no storage request was made.
- `package-lock.json` SHA-256 unchanged: `0D042AA8171967CED206DA10E1D9966F4CE3C36605B2FE5A95EF9965102E6187`.

## Mutations

1. `a2-thinking-box-removed`: renamed the thinking-box invariant. Portal contract failed 1/8, then passed after restoration. `src/components/task-chat.tsx` restored byte-exact to SHA-256 `8D570709B71CFDD82D3B77AE53C5724900738BBAE2BC8199D4E5F7EEF9D2BB85`.
2. `client-shell-reverts-paper`: changed the client shell from night to paper. Portal contract failed 1/8, then passed after restoration. `src/app/client/layout.tsx` restored byte-exact to SHA-256 `CAF4DE97385483897C4DE6FC975EEB4F0381466BCB332EB75923E225EB6FDF96`.

## Limits and remaining risks

- No authenticated test credentials were available. The real login/register pages were rendered directly; dashboard and intake visual evidence used temporary routes importing the exact production components without bypassing authentication. Real session, database-backed task states, quote/payment controls and sign-out still need an authenticated review.
- Task-detail, standing-capacity and some action/error copy remain English even when the shell is FR/ES/FIL.
- Academy course bodies remain English by repository policy, and their `html lang` remains `en`; course chrome is translated.
- No backend, Prisma schema, migration, payment, gateway, production or deployment behavior was changed.
- No claim is made that A2 executes tasks autonomously. The existing intake action still structures a brief only.

## Not touched

- `C:\dev\nightlexicon` original checkout.
- `C:\dev\nightlexicon-publicsite-endvera` production worktree.
- Canonical Brain files.
- `master`, GitHub remote state, Vercel, ENDVERA Production, databases, migrations, R2 configuration or secrets.

## Exact next action for the controller

Review the before/after captures, then provide a non-production client test account in an isolated local database so the candidate can be exercised through real login, dashboard states, task detail, price approval, payment handoff, review and result download. Reconcile the historical V7 scope guard in its own lane before any release gate. Do not push this candidate yet.
