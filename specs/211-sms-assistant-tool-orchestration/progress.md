# SMS assistant orchestration — local implementation checkpoint

## 2026-09-11 17:03Z — second local slice, live service still unchanged

Added separate durable owner search scope and current search-provider disclosure
review; inference privacy flags alone cannot approve Exa. Added a maximum of
three earlier general-answer exchanges within24h, same owner/workspace/SMS
identity. History is untrusted and never copied into public research.

Added durable property jobs with immutable source/policy binding, one claim,
append-only progress, owner report isolation and expiry recovery without retries.
Only synthetic source registries are accepted. New property migration brings
the local schema to82; legacy catalog80 remains frozen and refuses this release.
Prisma schema includes the new table and validates with a fake loopback URL;
no shared generated client was refreshed.

Evidence: `evidence/validation.json`, `root-tests.json`, `targeted-tests.json`.
Targeted regressions:2543 passed/152 files. Native answer12 and property4 passed,
servers stopped. TypeScript/scoped lint PASS. Full root is NOT GREEN:17 frozen
pilot suites refuse expanded migration inventory; one computed-import graph
case failed during full run and passed unchanged in isolated rerun. No code
change or root-green claim is justified by that isolated pass.

Additional observed fixture failures preserved: property withdrawal used an
invalid enum value `inactive`; corrected to existing `revoked`, with product
guards untouched. A PowerShell harness invocation incorrectly passed an array
to its single-file argument and refused before starting a database; subsequent
separate invocations were valid. No real provider/source/SMS/deployment occurred.

The first code commit is `113087a772aa1dde9fca2d649328b9936fbf3041`.
Remaining E/F work and activation prerequisites are explicit in the queue. This
is not a completed project, a new APK, or an active replacement on the SMS number.

## 2026-09-11 16:39Z — implementation in progress

Plan commit: `4333a132`. Implementation remains uncommitted at this checkpoint.
Worktree: `C:\dev\endvera-astra-r03`, branch `codex/endvera-astra-r03`.

- Seven-lane routing, local greetings, guarded answer and public-research
  operations, exact Auto Router model allowlist, Exa search caps, cited extracts,
  six-tool synthetic property workflow, tenant-owned reports and SMS outbox
  integration are implemented locally. No published route or runtime activation.
- Native PostgreSQL 17.11 campaign completed at 16:30:38.993Z with six tests
  passing. It applied 81 migrations on a new disposable cluster, injected all
  provider responses, and stopped its own server. Fingerprint:
  `81:7b3af8ff692b776e7f28bd104c28da0e`.
- Initial native run had five passing and one failing test: the synthetic grant
  revocation fixture omitted clearing scopes and incrementing stateVersion.
  Corrected fixture respects the existing guard; product guard was not weakened.
- TypeScript completed successfully before the expiry-recovery addition.
- Broader selection: 159 files passed; 17 suites refused the newly added migration
  at the frozen spec210 catalog boundary, and one operation-registry assertion
  still listed the old three operations. 2,814 tests passed and one failed.
  The registry assertion now names the two explicit new operation types.
- Do not change the historical 80-migration deployment catalog or reuse its
  receipts as permission to deploy migration 81. A separately reviewed release
  catalog and upgrade trial are required. These are not baseline failures: they
  are an explicit compatibility gate introduced by the new migration.
- Latest new HTTP transport tests initially failed due to omitted required
  timeoutMs in their synthetic fixture; fixture corrected, rerun pending.
- Added expiry recovery, concurrent dispatch and owner-report isolation tests;
  expanded native campaign still running at this checkpoint.

No real OpenRouter call, source lookup, SMS, call, key access, deployment or APK
build occurred in this implementation. No metric rubric advanced. Prior recorded
dashboard remains roadmap 22%, local build 46.75%, C2 18/18, real-test NO-GO,
Verified-E2E 0%; those percentages were not remeasured here.

## Remaining work

Expanded native campaign completed 16:39:31.639Z: ten tests passed, including
concurrent dispatch, late revocation, expiry bookkeeping and cross-owner report
access. Its disposable server stopped. The new fixed-endpoint HTTP tests also
passed (five tests, injected fetch only) after correcting the fixture timeout.

- Finish expanded tests, lint/typecheck and code review, then commit this slice.
- Complete durable property jobs, bounded conversation context and action bridge
  validation; source connectors are currently injected contracts, not live access.
- Prepare updated migration/activation review without altering historical proof.
- Refresh current pricing, privacy, envelope exposure, owner consent and encrypted
  credential readiness before any bounded live route. Account credit is not proof.
- The app goal API refused replacement of an older unfinished goal. Keep the
  file-backed queue; do not falsely complete that old goal. No timer restarted.
