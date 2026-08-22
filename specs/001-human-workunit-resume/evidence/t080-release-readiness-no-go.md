# T080 — HumanWorkUnit release-readiness decision

**Decision:** **NO-GO LIVE**.

T080 repaired and refreshed the local release evidence that could be handled
without a remote write. It did not push, create a PR, run CI, deploy a Preview,
touch Production, change an environment variable, migrate Neon, enable the
rollout setting, call a provider or send customer traffic.

## Candidate identity

- Worktree: `C:\dev\nightlexicon-humanworkunit`.
- Branch: `feat/human-workunit-resume`.
- Runtime candidate: `6b5a76718f7baf902920e22972c485de530b4024`.
- Frozen pre-review base: `d7f0a394c14259518df3184a3f93fc14293a1427`.
- Tracked tree was clean before T080 documentation; the pre-existing untracked
  `.agents/` directory remained preserved.
- Lockfile SHA-256 remained
  `0B01B24159591440E08F8F78FAF3C6E17EF5CE293304B773651F69EC7F60A7CD`.

## GitHub and CI — fresh evidence

- Exact remote branch lookup returned no
  `refs/heads/feat/human-workunit-resume`.
- GitHub returned no commit for candidate SHA `6b5a767`, no matching branch,
  no workflow run and no combined status.
- The authenticated GitHub login was identifiable, but the integration could
  not read collaborator permission. Technical access is not release ownership.
- Therefore no remote candidate, review, CI or deployable artifact corresponds
  to the local SHA.

## Vercel and runtime — fresh evidence

- Vercel project `afterdesk` is connected to `olipoli10/afterdesk-` and reports
  `live: false`.
- The current READY Production deployment is a different artifact:
  `a3182b1126ab104874d7f603be1df215fdb2a378` from `master`.
- The latest observed Preview attempt is also unrelated to HumanWorkUnit and is
  `ERROR`: required R2 storage configuration is absent and Better Auth reports
  that its base URL is not set. A HumanWorkUnit Preview would inherit an
  unproved environment until this is corrected and read back.
- Fresh 24-hour Production telemetry returned no grouped runtime-error cluster.
  Log counts were 4,917 HTTP 200, 207 HTTP 404 and 3 HTTP 307; no error/fatal
  route group was returned. This is evidence about the currently deployed
  `a3182b1` artifact, not the HumanWorkUnit candidate.

## Target database and rollout setting — fresh evidence

The code proves that `humanWorkUnitResumeEnabled` is a database `Setting`. The
repository default is `false`, the database overrides it per request, and the
sole admission check is in `src/server/workflow-runs.ts`. It is not a Vercel
environment variable.

Read-only Neon inspection found:

- the application-shaped `neon-cerulean-window` main branch has 36 completed
  Prisma migrations, no HumanWorkUnit table, zero of the three HumanWorkUnit
  migrations, and no explicit `humanWorkUnitResumeEnabled` row;
- the separately named `endvera-core-sandbox` main branch has 32 completed
  migrations, no HumanWorkUnit table, zero of the three HumanWorkUnit
  migrations, and no explicit rollout row.

The 36-migration fingerprint ends at the voice-intake migration observed in
the current application release history, so it is the likely Production data
project. That mapping remains an **inference**, not a Vercel environment
readback. The absent row means current code falls back to `false`; it does not
supply a named owner, approved change path or target identity proof.

## Migration classification

| Migration | Classification | Release consequence |
|---|---|---|
| `20260815120000_human_work_unit_enums` | Additive and forward-compatible; no backfill; one-way PostgreSQL enum/type additions | Old code can ignore the new values/types, but the schema change is not down-migrated. |
| `20260815120100_human_work_unit` | Additive tables, indexes, constraints, triggers and two additive plan-step columns; no backfill | Requires a target rehearsal and previous-artifact compatibility check; retained HumanWorkUnit state prevents schema rollback. |
| `20260819150000_human_unit_admission_refusal` | Additive nullable column; no backfill | Historical runs remain null; old code can ignore the column. |

No HumanWorkUnit migration was executed on Neon in T080.

## Fresh local verification

The first full PostgreSQL attempt was contaminated by an interrupted prior run
and was discarded. A single-file rerun passed 28/28, proving the reported
lifecycle failures were inter-suite interference. The named disposable Prisma
Dev instance later lost its main process under the concurrent spend-ceiling
test. It was stopped, then only `hwu-integration` was removed and recreated.
The deleted contents were disposable test data and were rebuilt from source.

Accepted pristine evidence after recreation:

| Gate | Fresh result |
|---|---|
| ESLint | PASS, zero reported errors/warnings |
| TypeScript | PASS |
| Fast suite | 63 files / 1,494 tests PASS |
| Fresh migration chain | 35/35 applied from zero to local `afterdesk_integration` |
| Spend-ceiling reproduction | 1 file / 14 tests PASS |
| Full PostgreSQL suite | 29 files / 345 tests PASS |
| Direct Next.js 16.2.12 build | PASS; TypeScript PASS; 95/95 pages generated |
| Narrow tracked-file secret-pattern scan | zero matching files; not a substitute for an independent scanner |
| `npm audit --audit-level=high` | FAIL: 3 high-severity findings through `deepmerge-ts` / Prisma configuration |

The audit-proposed forced fix would introduce a breaking Prisma change and was
not run. No dependency or lockfile changed.

## Ownership and rollback

No repository artifact names the release owner, flag owner, rollback operator,
alert owner or stop-decision authority. The prepared procedure is
`docs/human-work-unit-rollback-runbook.md`, but it remains unexercised and has no
operator. A document without owner and target readback is not rollback proof.

## Gate decision

**GO LIVE CANDIDATE is refused** because all of the following remain true:

1. no pushed candidate, PR, CI or matching Vercel artifact exists;
2. the Preview environment fails its current build configuration gate;
3. the exact Vercel-to-Neon target mapping, recovery point and owner are not
   independently recorded;
4. the three migrations are absent from the likely target and have no
   authorized target rehearsal;
5. flag, rollback, alert and release owners are unnamed;
6. the high-severity dependency audit gate fails;
7. no authorized Preview smoke exists.

This is a decisive **NO-GO LIVE**, not BLOCKED: adverse evidence already makes
release unsafe. The next controller mandate must name owners and authorize an
isolated non-Production remediation lane for dependency resolution, Preview
configuration readback, an isolated Neon migration rehearsal, a remote
candidate/PR and CI. Production still requires a later, separate human GO.
