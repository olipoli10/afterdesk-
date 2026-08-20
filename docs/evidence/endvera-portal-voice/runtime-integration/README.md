# Voice Runtime Integration Evidence

This evidence package supports only a local `CODE + TEST + SYNTHETIC` checkpoint for Lane B.

## Sources

- Portal base: `codex/endvera-portal-v1@7769a64020cfe4e231c8afbaa8318f07ac01ac01`
- Audio Intake source, read-only: `codex/intake-voice-transcription@cd381ef6a69d9729640b35e0aeeff2361ad45b77`
- Runtime implementation commits: `429282ad35e189f850c24b803908e09d8a366d6b`, followed by local Prisma isolation and gate remediation at `2ad8d2c`.

## Verified behavior

- Default runtime readiness is fully disabled and fail-closed.
- Authentication is required for every portal voice server action.
- Segment metadata must match actual payload bytes and an enabled MIME format.
- Session spend admission uses committed exposure plus the requested hold.
- Portal-local Prisma generation isolates the lane from the protected checkout.
- The portal includes the real Audio Intake persistence and lifecycle boundary, but no provider transport is adopted or reachable in the disabled configuration.

## Successful gates

| Gate | Result |
|---|---|
| Targeted runtime | 20 files / 94 tests PASS |
| Fast suite | 75 files / 1,150 tests PASS |
| PostgreSQL integration | 13 files / 92 tests PASS |
| Fresh migrations | 33/33 PASS |
| ESLint | PASS |
| TypeScript | PASS |
| Local Webpack build | PASS |
| Static pages | 96/96 |
| `git diff --check` | PASS |

PostgreSQL integration and build used separate fresh disposable instances. The build used only process-local non-secret placeholders for unrelated mandatory configuration. No provider, Preview or Production endpoint was contacted.

## Mutation proof

| Mutation | Expected RED | Restored proof |
|---|---|---|
| `portal-voice-provider-adoption-ignored` | 1 failed / 5 passed | boundary 6/6 PASS; SHA-256 `A8714C6399B981F6715FAC7887C7D5853D826CE6E2212FEF83D6587022FAB302` |
| `portal-voice-declared-byte-count-trusted` | 1 failed / 5 passed | boundary 6/6 PASS; same byte-exact hash |
| `portal-voice-readiness-unauthenticated` | 1 failed / 5 passed | action 6/6 PASS; SHA-256 `11A531BA04E4D68DAED70CFBBACC15D1A272B9A6C6D956341502052A3DFDD631` |
| `voice-session-ceiling-overflow-admitted` | PostgreSQL 1 failed / 3 passed | 4/4 PASS; SHA-256 `29BA1B19B604DDF5FDEF9925F9522787D86FC356FC25045674D2AF0BBFF41732` |

## Explicit non-proofs

- No real provider test.
- No provider quality, privacy, cost or latency certification.
- No OpenRouter adoption.
- No native Tagalog review.
- No Firefox proof.
- No Safari proof.
- No Preview, Production, push or rollout authorization.
- The portal still sends `Permissions-Policy: microphone=()`.

See `docs/handoffs/ENDVERA_PORTAL_VOICE_RUNTIME_LOCAL_HANDOFF.md` for the complete handoff and failed-attempt accounting.
