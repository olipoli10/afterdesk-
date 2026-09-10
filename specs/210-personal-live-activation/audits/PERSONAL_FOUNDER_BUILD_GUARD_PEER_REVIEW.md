# Founder Android build guard — bounded peer review

2026-09-10. Worktree `C:/dev/endvera-astra-r03`. Scope: accepted `ANDROID_FOUNDER_BUILD_GUARD_PLAN.md`, both author sources and 44 author tests read completely, plus 13 separately written counter-tests. The engineering code-review skill structured the review. This is another agent's code review, not a certification by an independently validated model or runtime.

## Verdict

**GREEN for the announced local input-guard change.** No critical defect found in the source/identity/origin checks and launcher ordering reviewed. No product RED was observed in this review. This does not authorize a build or certify a remote backend, cloud environment, spending envelope, binary, installation, or Samsung behavior.

Reviewed final source fingerprints:

- `scripts/check-founder-android-inputs.mjs`: `a5db03587865e3454d218dd5169513582536d13b65bbfef54f853eef3d4511b9`
- `scripts/start-founder-android-build-secure.ps1`: `3e3d508fec228857e60d4c6d2e79438dd537f83ed332f4ecbfad71a5e49cb3de`
- Peer `test/personal-founder-android-build-inputs-review.test.ts`: `2d64ffc8c8c4661b0542f32f2fb2873790b3079e58d18abe629bf632df324e0e`

## Checks

- The controller's HEAD, exact dedicated HTTPS origin and integer Android version are mandatory. URL normalization cannot turn credentials, a path, query, trailing slash or explicit port into the accepted origin.
- The source founder profile must contain only the explicit public API origin in its `env`; inherited/cloud-environment indirection and unrelated or secret-like environment fields refuse. Current actual `eas.json` has no such env and is explicitly refused by the pure source-profile control. This is not an observation of remotely stored EAS variables.
- Project ID, owner, package, scheme, Expo/package semantic version, Android release definition and existing build-readiness contract are checked. Merely changing the controller's requested number does not make an incoherent source pass.
- Real local runner reads and checks HEAD/status before source inspection and rechecks after complete existing source binding and direct byte rereads. Dynamic Expo app configs refuse. The underlying source-binding code was read; the author's runner tests deliberately mock Git and binding, so they prove ordering/refusal under supplied observations, not a fresh end-to-end clean-checkout positive.
- The last author delta adds `--no-optional-locks` plus `core.fsmonitor=false` to the wrapper's Git reads. It avoids the optional index refresh by `git status`; source-binding read commands remain unchanged. This small delta was reread and included in the final rerun.
- The launcher's sole `npx` invocation is behind `Assert-FounderBuildInputs`; its only two call sites are `whoami` and one fixed noninteractive Android internal `founder-device` build. Therefore both calls obtain a fresh guard, including after authentication latency immediately before submission.
- No launcher project initialization, login/configuration, implicit Git add/commit/push, version bump or auto-submit remains. Failures use fixed messages and never echo arbitrary supplied values or EAS output; no automatic retry after an unknown external outcome.
- Result scalars are copied and frozen, with `executionAuthorized`, `backendCompatibilityVerified`, `remoteEasConfigurationVerified`, `budgetVerified` and `buildInvoked` all false. Accessors/proxies are rejected without executing their traps.

## Fresh validation and limits

- Initial separate run: **57/57 PASS** at 18:20:47 (44 author + 13 peer).
- After final optional-lock delta: **57/57 PASS** at 18:21:36, exit 0.
- Peer ESLint: exit 0. Author reported final TypeScript session 34486 exit 0 and fresh 57/57 PASS at 18:24:24. No duplicate global run launched here.
- Final hash addendum: the author added only `@returns {never}` to the always-throwing `fail` helper so TypeScript recognizes the terminal catch. This resolved three author-test possibly-undefined diagnostics, not a runtime defect. The annotation and new hash were reread locally; no executable expression changed from reviewed `0e3ace40...b280d`, and the launcher is unchanged.
- Peer tests use actual pure helper + independently assembled in-memory config fixtures. The sole subprocess test invokes only the Node helper with an invalid origin and observes its fixed refusal before Git/EAS. Launcher assertions are source-shape checks, not execution of PowerShell/EAS.
- Source-mutation during binding/another preflight is covered by the author's explicitly mocked runner; the peer additionally exercises repeated pure validation after mutations. Neither is a hostile concurrent filesystem/TOCTOU certification.
- The profile/version files stay unchanged; no APK was requested, no network/provider/credential access, no Git commit (including temporary fixture commits), and no signing/build/deployment action occurred in this review.

Reviewer ownership: only this audit and the new peer test file. The current guard's deliberate refusal is the desired result until the controller has separately reconciled the backend, source profile and next version.
