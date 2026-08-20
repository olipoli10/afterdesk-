# ENDVERA Portal Voice Runtime — Local Handoff

## Status ceiling

`CODE + TEST + SYNTHETIC`

- Voice rollout remains disabled.
- The portal keeps `Permissions-Policy: microphone=()`.
- OpenRouter remains an unadopted candidate.
- No real provider was contacted or tested.
- No provider credential or secret was added.
- No push, Preview, Production deployment, or Brain write occurred.
- This is a local runtime-integration candidate only; it is not a rollout authorization.

## Lane identity

- LANE: B — Real Audio Intake runtime integration
- WORKTREE: `C:\dev\nightlexicon-endvera-portal-v1`
- BRANCH: `codex/endvera-portal-v1`
- BASE SHA: `7769a64020cfe4e231c8afbaa8318f07ac01ac01`
- IMPLEMENTATION SHA: `2ad8d2c` follows `429282ad35e189f850c24b803908e09d8a366d6b`; use `git rev-parse HEAD` for the docs-only handoff commit that contains this file.
- AUDIO SOURCE (READ-ONLY): `C:\dev\nightlexicon-intake-voice`, `codex/intake-voice-transcription@cd381ef6a69d9729640b35e0aeeff2361ad45b77`
- AUDIO SOURCE BASE: `9bdde32b91b0dd0eaf7ae0f1c05e02e653988cfc`

## Tasks completed

- Reconciled the accepted Audio Intake session, segment, transcript, account-spend, Model Gateway and audit runtime substrate into the portal.
- Added a portal-owned server boundary that defaults every readiness fact to false and requires every rollout, operation, policy, routing, spend, provider-adoption, real-provider-certification, consent, language, format and budget fact before runtime admission.
- Delegated authenticated portal server actions to the runtime boundary for readiness, session creation, segment registration, session completion, transcript assembly and cancellation.
- Verified the declared audio byte count against the actual `ArrayBuffer` byte length and verified the MIME type against the enabled formats.
- Added the four additive Prisma migrations required by the imported runtime substrate.
- Isolated the generated Prisma client inside this worktree so verification does not mutate or rely on the protected checkout's generated client.
- Raised the local Server Action request ceiling to 3 MB for the already specified 2 MB segment envelope.

## Fail-closed result

The production boundary contains no `process.env` activation path and its configuration is entirely false. Missing any required fact returns the disabled facts before database access or adapter dispatch. The portal does not wire a real provider transport. The OpenRouter adapter is only an injected-transport candidate mapper; it contains no `fetch`, credential lookup or adoption authority.

The runtime source is now present, but a real transcript cannot be produced while rollout, provider adoption and real-provider certification remain false. That is the intended local-only state.

## Exact proofs

- Boundary RED: missing boundary module caused `1` suite failure / `0` tests executed.
- Server Action size RED: `1` failed / `4` passed until the 3 MB limit was configured.
- Byte-envelope RED: `1` failed / `5` passed until actual byte length was checked.
- Targeted audio/OpenRouter/runtime: `20` files / `94` tests PASS.
- Full fast suite: `75` files / `1,150` tests PASS.
- Fresh PostgreSQL full integration: `13` files / `92` tests PASS.
- Fresh PostgreSQL migrations: `33/33` PASS from zero.
- ESLint: PASS.
- TypeScript: PASS.
- Local Webpack build: PASS; compile `5.9 s`, type check `12.3 s`, static pages `96/96` in `945 ms`.
- `git diff --check`: PASS.
- Portal lockfile SHA-256: `0D042AA8171967CED206DA10E1D9966F4CE3C36605B2FE5A95EF9965102E6187`, unchanged from lane start.

The successful PostgreSQL integration proof used a fresh disposable instance named `endvera-portal-voice-runtime-v2` with database `afterdesk_portal_voice_v2_integration`. The successful build used a different fresh disposable instance named `endvera-portal-voice-build` with database `afterdesk_portal_voice_build`. Process-local non-secret placeholders satisfied unrelated auth/R2 build validation. No external provider traffic occurred.

An earlier integration attempt lost its disposable database after initial targeted success and therefore has no full-suite verdict. An earlier build stopped at unrelated missing R2 configuration and therefore also has no build verdict. Neither failed attempt is presented as evidence.

## Named mutations and byte-exact restoration

1. `portal-voice-provider-adoption-ignored`
   - Mutation removed the provider-adoption gate.
   - Result: `1` failed / `5` passed; false configuration incorrectly returned fully enabled facts.
   - Restored boundary SHA-256: `A8714C6399B981F6715FAC7887C7D5853D826CE6E2212FEF83D6587022FAB302`; then `6/6` PASS.
2. `portal-voice-declared-byte-count-trusted`
   - Mutation removed the actual-byte-length comparison.
   - Result: `1` failed / `5` passed; declared 3 bytes versus actual 4 bytes was accepted.
   - Restored boundary to the same byte-exact hash; then `6/6` PASS.
3. `portal-voice-readiness-unauthenticated`
   - Mutation removed `requireRole("CLIENT")` from readiness.
   - Result: `1` failed / `5` passed; only five authentication checks were observed instead of six.
   - Restored action SHA-256: `11A531BA04E4D68DAED70CFBBACC15D1A272B9A6C6D956341502052A3DFDD631`; then `6/6` PASS.
4. `voice-session-ceiling-overflow-admitted`
   - Mutation restored the old spend condition.
   - Result on fresh PostgreSQL: `1` failed / `3` passed; existing 80 plus new 30 under a 100 ceiling was incorrectly authorized.
   - Restored dispatch SHA-256: `29BA1B19B604DDF5FDEF9925F9522787D86FC356FC25045674D2AF0BBFF41732`; then `4/4` PASS.

## Remaining tasks and risks

- Native Tagalog review remains missing.
- Firefox browser proof remains missing.
- Safari browser proof remains missing.
- Real-provider privacy, cost, latency and quality certification remains missing.
- Provider adoption remains a separate canonical decision.
- Enabling the microphone Permission Policy and the voice rollout remains a separate explicitly authorized lane.
- These local proofs do not authorize Preview or Production.

## Protected boundaries

- Audio Intake source: read-only and unchanged.
- Canonical Brain: read-only and unchanged.
- Original `C:\dev\nightlexicon`: no tracked write; its pre-existing untracked state was preserved.
- `package-lock.json`: unchanged.
- Shared/Production databases: not used.
- Push/deployment: none.

## Requested next action

Controller Brain should perform a read-only review of the final local portal HEAD and this evidence, then record at most: `CODE + TEST + SYNTHETIC`, runtime boundary integrated, voice rollout disabled, OpenRouter not adopted, no real provider tested, local review only. It must not record GO rollout.
