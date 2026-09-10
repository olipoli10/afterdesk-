# Founder guard — real local source-binding validation

Date: 2026-09-10. Scope: test-only local validation; no EAS, network, credentials, dependency installation, project index change or project commit.

## Evidence

`test/personal-founder-android-build-source-binding.test.ts` executes the actual `checkFounderAndroidBuildInputs` and actual release source-binding helper against eight separately created temporary Git repositories. Git is not mocked. Each fixture copies nine public source/configuration files, adds an explicit synthetic founder origin only inside the fixture, and makes a local synthetic commit. No supplied `trackedSourceBindingVerified` value substitutes for the helper result.

The eight cases cover a clean positive result without changes to HEAD/index/input bytes, ordinary source mutation, an untracked file, mutations concealed by `assume-unchanged` and `skip-worktree`, valid tracked PS1 LF/CRLF normalization, an ignored dynamic configuration file, and a second clean commit inconsistent with the original expected HEAD. The two concealed-mutation cases assert that real Git status is empty before requiring rejection from the actual source-binding check.

Every Git subprocess has a five-second timeout and bounded captured output. Every test has a twenty-second timeout. All mutations stay in a test-created temporary checkout. Cleanup validates allocation membership, exact temporary parent/name, real paths and absence of a symlink before removing the exact fixture container; all eight cleanup assertions passed.

## Retained fixture corrections

- 18:29:44 America/Toronto: 7 PASS / 1 FAIL. The first CRLF fixture had a modified Git status before invoking the guard.
- 18:30:48: targeted CRLF case 1 FAIL / 7 filtered tests. `checkout-index` retained LF bytes, so the fixture's expected CRLF assertion failed before invoking the guard.
- The fixture now explicitly configures local `core.autocrlf`, renormalizes only its copied PS1 file and asserts that its cached diff is empty. This is a fixture correction, not a product defect or product-source fix.
- 18:31:44: targeted CRLF case PASS.

## Final validation and freeze

Combined safe-environment run starting 18:32:25: **65/65 PASS**, three files, 20.34 seconds: 8 real-Git tests + 44 existing author tests + 13 independent guard-review tests. All eight new tests ran; no skips. Scoped ESLint and full TypeScript `--noEmit --incremental false` exited zero.

- New test SHA-256: `ee53365d0b9d6b08cdb53a0f6ba82d8a934e3cd0bbd725028d02405aed82f8d9`.
- Unchanged guard SHA-256: `a5db03587865e3454d218dd5169513582536d13b65bbfef54f853eef3d4511b9`.

This proves the bounded local fixture behavior only. It does not establish remote EAS configuration, backend compatibility, build authorization, APK identity or a successful build. The project's current founder configuration remains unchanged; no approval is manufactured from the synthetic positive fixture.
