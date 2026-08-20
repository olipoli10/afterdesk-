# ENDVERA portal microphone — local handoff

## Verdict

**NO-GO LOCAL for rollout. Candidate code, tests and synthetic browser evidence are ready for controller review.**

The local candidate is fail-closed and preserves the typed A2 composer. It is not eligible for voice rollout because native Tagalog review and Firefox/Safari browser evidence are still absent, and the real Audio Intake runtime has not been integrated or provider-certified.

## Scope completed

- Reconciled the Audio Intake portal handoff into a typed, inert portal server boundary.
- Added the complete `Speak instead` disclosure, consent, recording, pause/resume, finish, cancellation and transcription experience.
- Preserved editable text, explicit `Send to A2` and zero auto-send behavior.
- Added exact readiness, language, MIME, duration, byte and session limits.
- Added accessible labels, focus recovery, polite progress, assertive alerts and reduced-motion behavior.
- Added EN/FR/ES/TL copy and visual evidence at desktop, 390 px and 360 px.
- Added synthetic Chrome/Edge interaction and independent-blob evidence.
- Added unit/static tests and mutation evidence.

## Not completed

- Native human Tagalog review.
- Firefox and Safari browser execution.
- Real Audio Intake runtime integration.
- Real provider, OpenRouter, route, credential, privacy, cost or latency certification.
- Any rollout, Preview, Production deployment or push.

## Exact source constraints

- Worktree: `C:\dev\nightlexicon-endvera-portal-v1`
- Branch: `codex/endvera-portal-v1`
- Base: `5fbe8c673e1a0a7d08e0f600e3188a4fa49231ff`
- Audio source inspected read-only: `cd381ef6a69d9729640b35e0aeeff2361ad45b77`
- Brain inspected read-only: `4f5b2a4b1c2f44b5db430ff04fdb355053c1d5a0`
- Voice server boundary restored hash: `C1D63BE8320A9FAF2445DF624320BFBC86DAECF69943A2246BEA370A405ECDA0`
- Lockfile preflight hash: `0D042AA8171967CED206DA10E1D9966F4CE3C36605B2FE5A95EF9965102E6187`

## Evidence

- Full packet: `docs/evidence/endvera-portal-voice/README.md`
- Canonical-disabled captures: `docs/evidence/endvera-portal-voice/final-disabled/`
- Synthetic interaction reports and captures: `docs/evidence/endvera-portal-voice/interactions/`
- Prior portal baseline captures, not modified: `C:\Users\oliro\.codex\visualizations\2026\08\20\endvera-a2-opening-v2`

## Controller action

Review this local commit and packet. Keep voice rollout disabled. If accepted, record it in the Brain as `CODE + TEST + SYNTHETIC / rollout disabled`, then assign native Tagalog review plus Firefox/Safari evidence as the next bounded lane. Do not authorize Preview or provider experimentation from this handoff.
