# R32 Contractor Onboarding and Bounded Import — closeout evidence

Recorded at: 2026-09-02T10:45:00-04:00

## Result

R32 adds a canonical, workspace-scoped contractor onboarding path and bounded
CSV imports for projects and contacts across the existing Web portal and shared
Expo iOS/Android application. Imports are previewed before any canonical write,
require an explicit decision for every conflict, are version-bound, and commit
atomically. Raw CSV content is not retained after parsing.

## PostgreSQL and concurrency proof

- The R32 migration is additive and forward-only. Prisma formatting and schema
  validation passed against disposable local PostgreSQL.
- R32 Prisma Dev integration: 1 file, 5 tests passed.
- R32 direct PostgreSQL concurrency integration: 1 file, 5 tests passed.
- Concurrent identical commands collapse to one canonical effect. Altered
  command replay, stale batch versions, cross-workspace candidates and reuse,
  post-preview conflicts and a failing row all refuse without a partial commit.
- A terminal import source cannot be previewed again. Safe `CREATE_NEW` is
  limited to a same-batch duplicate or ambiguous identity with no existing
  canonical candidate; otherwise the decision fails closed.

## Validation

- R32 root unit gate: 1 file, 5 tests passed.
- R32 mobile gate: 1 file, 3 tests passed.
- Root full unit suite: 134 files passed, 2 skipped; 1,951 tests passed, 2
  skipped.
- Mobile full suite: 23 files, 91 tests passed.
- Root and mobile lint: passed.
- Root and mobile TypeScript: passed.
- Expo Doctor: 21/21 checks passed.
- Local Expo export: iOS, Android and Web passed; 51 static routes include the
  onboarding cockpit.
- Next.js 16 Webpack build: passed; 109/109 static pages generated and the
  private `/api/endvera/v1/mobile/onboarding` route included.
- Spec Kit Analyze: PASS; 6 user stories, 25 functional requirements, 11
  success criteria and 25 tasks, with zero critical or high finding.
- `git diff --check`: passed with line-ending notices only.
- `package-lock.json` and `apps/mobile/package-lock.json`: unchanged; no
  dependency was added.

## Historical integration-suite exception

The serialized full integration run completed with 67 files passed and one
historical file failed: `test/integration/budget-demotion-integration.itest.ts`.
Its three failing cases stop in the existing provider-replay synthetic harness
because no responder is registered for stage `other`, before budget
classification. A targeted rerun reproduced the same three failures. R32 does
not modify that test, the provider-replay harness, the AI engine or budget
classification. All other 467 integration tests passed, including the R32 and
Construction regression gates. This unrelated historical harness defect is
recorded honestly and was not repaired by expanding R32 scope.

## External-effect, tenancy and role audit

The R32 server and mobile contracts report `providerObserved: false` and
`externalEffectCount: 0`. No R32 implementation path calls a messaging,
calendar, accounting, AI or storage provider. Browser transport is restricted
to the existing authenticated same-origin API client. Owner/office imports and
their conflict details are absent from the field-worker projection. All writes
recheck active workspace membership at point of use.

## Dashboard boundary

- strict canonical roadmap phase exits: 22%, unchanged;
- local AI engine build readiness: 46.75%, displayed 47%, unchanged;
- C2 preparation: 18/18 or 100%, unchanged;
- real provider/customer test readiness: `NO-GO`;
- Verified-E2E observed coverage: 0%.

R32 evidence remains `CODE + TEST + SYNTHETIC + DISPOSABLE POSTGRESQL`. It does
not prove customer value, provider behavior, device observation, store
readiness, deployment, Production or Verified-E2E coverage.
