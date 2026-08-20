# ENDVERA portal voice — local reconciliation packet

Status: **NO-GO LOCAL for rollout; candidate implementation complete for review.**

This packet reconciles the Audio Intake portal contract into the ENDVERA portal without merging or copying the divergent Audio Intake runtime. The portal exposes a typed server-action seam whose canonical implementation returns explicit negative readiness facts and disabled command results. Voice therefore remains unavailable unless a later, separately authorized integration supplies every required readiness fact coherently and positively.

## Authority and boundaries

- Portal base: `codex/endvera-portal-v1@5fbe8c673e1a0a7d08e0f600e3188a4fa49231ff`.
- Brain read-only authority: `main@4f5b2a4b1c2f44b5db430ff04fdb355053c1d5a0`.
- Audio source read-only authority: `codex/intake-voice-transcription@cd381ef6a69d9729640b35e0aeeff2361ad45b77`.
- Contract SHA-256: `8CEFAA61C28011A57E3C83E03EE4283CB1C6288FD20B0ABA03B1D02CFBDDDDD8`.
- Canonical capability status remains `CODE + TEST + SYNTHETIC`.
- Voice rollout remains disabled. OpenRouter is not adopted. No real provider, secret, database, Preview, Production or push was used.

## What the candidate proves

- Disclosure and explicit consent occur before permission is requested.
- Record, pause, resume, finish, cancel and teardown are implemented.
- The transcript enters the existing A2 composer, remains editable and is never auto-sent.
- `Send to A2` remains the only explicit submission action.
- Typed input remains available in every state.
- Missing, negative, unknown or contradictory readiness facts fail closed.
- Permission-denied and device-missing states expose honest accessible alerts and a text fallback.
- Incomplete results never populate or send a transcript.
- `dispatched_unknown` exposes no retry action and returns focus to the typed composer.
- Every visible voice target measured at least 44 by 44 CSS pixels; no voice text measured below 12 px.
- Reduced motion disables voice animation and transition effects.
- A 500 ms rollover safety margin prevents the 250 ms sampling timer from crossing the contractual 45,000 ms limit.

## Browser evidence

Observed locally with a synthetic browser audio source only:

| Browser | Version | Result | Long-run segmentation |
| --- | --- | --- | --- |
| Chrome | 151.0.7922.138 | PASS | 44,454 ms / 718,335 bytes, then 4,083 ms / 67,023 bytes |
| Edge | 151.0.4129.93 | PASS | 44,814 ms / 724,147 bytes, then 3,725 ms / 61,211 bytes |
| Firefox | Not installed on this Windows host | NOT RUN | UNKNOWN |
| Safari | Not available on this Windows host | NOT RUN | UNKNOWN |

The Chrome and Edge reports prove that rollover creates independent `MediaRecorder` instances and that each observed blob stayed below both 45 seconds and 2 MB. Unit tests separately freeze and test the exact inclusive limits: 45,000 ms and 2,000,000 bytes.

Key interaction reports are under `interactions/`:

- disclosure and consent at 200% zoom;
- permission denied;
- microphone missing;
- Spanish paused state at 360 px;
- cancellation confirmation, track teardown and focus return;
- French incomplete result;
- Spanish `dispatched_unknown` result;
- editable transcript and explicit send in Chrome and Edge;
- 46-second Chrome and Edge rollover runs.

Final canonical-disabled captures are under `final-disabled/` for English, French, Spanish and Tagalog at desktop, 390 px, 360 px and reduced motion. Every audit reports HTTP 200, zero horizontal overflow and zero error overlay.

The temporary `/voice-evidence` route used to render the exact production components was deleted before the final build and is not part of the candidate.

## Accessibility and localization

- Visible textarea label; polite status announcements; assertive alerts; modal cancellation semantics.
- Focus returns to `Speak instead` after cancellation, to `Record again` after a conclusive failure, to the composer for `dispatched_unknown`, and to the composer after a successful transcript.
- All measured controls meet the 44 by 44 px target minimum.
- English, French and Spanish copy was inspected in browser evidence, including French and Spanish wrapping.
- Tagalog was rendered at desktop, 390 px, 360 px and reduced motion with no overflow or collision.
- **A native Tagalog language review was not available in this lane.** Tagalog copy remains review-only and blocks rollout approval.

## Named mutations and RED evidence

1. `voice-readiness-negative-fact-bypass`: changed all canonical negative readiness facts to positive synthetic facts. The default-disabled boundary test failed exactly; the source was restored byte-for-byte to SHA-256 `C1D63BE8320A9FAF2445DF624320BFBC86DAECF69943A2246BEA370A405ECDA0`.
2. `voice-auto-send-invariant`: changed the reducer's initial `autoSend` runtime value to true. Six invariant checks failed across permission denial, missing device, finish, incomplete, uncertain, ready and cancellation paths; the source was restored byte-for-byte to SHA-256 `2865EF17E63045CBE1A571D14F5CE4CC85E279FE96EE03F65373292F31152E10`.
3. `voice-incomplete-result`: made the synthetic finish action return `incomplete`; the browser proved an empty composer, no send and focused recovery action. Restored.
4. `voice-dispatched-unknown-result`: made the synthetic finish action return `uncertain/dispatched_unknown`; the browser proved an empty composer, no retry action and focus on typed input. Restored.
5. The initial 46-second browser run exposed a real rollover timing failure. A RED contract test was added, the trigger was moved to 44,500 ms, and the complete Chrome/Edge run then passed.

## Verification summary

- Targeted portal/voice: 4 files, 36 tests PASS.
- Full Vitest: 57 files PASS, 1 historical lane guard FAIL; 1,079 tests PASS, 1 guard FAIL. The failing `public-site-endvera-v7` test intentionally rejects every change outside its older public-site allowlist and also lists portal files already present in this lane's base.
- ESLint full repository: PASS.
- `tsc --noEmit`: PASS.
- Local optimized build: PASS with `VERCEL_ENV=preview` and webpack, 96 routes/pages. No migration and no external provider call.
- `git diff --check`: PASS (line-ending warnings only).

## Remaining gates

1. Native Tagalog copy review and written approval.
2. Firefox browser run on an available host.
3. Safari browser run on macOS/iOS.
4. Separate controller decision to integrate the real Audio Intake runtime and certify route/provider readiness.
5. Separate authorization for any Preview. Rollout must remain disabled until then.
