# R33 Web, iOS and Android Golden Workflow Parity — closeout evidence

Recorded at: 2026-09-02T07:54:08-04:00

## Result

R33 exposes one eight-step Golden Workflow over the existing canonical
Construction state. Web and the shared Expo iOS/Android application receive
the same versioned role-safe projection, state fingerprint, blockers,
progress and one primary next action. The Web language selection changes only
display copy; it never changes the canonical fingerprint or workspace state.

The workflow is independent for owners/office managers and field workers.
Field workers see only assigned work, evidence and history steps; financial,
approval, contact-directory, import, policy and secret fields fail closed.
Calendar, SMS/MMS, voice, email and accounting remain visibly unavailable and
produce zero external effect.

## PostgreSQL and parity proof

- R33 unit/parity gate: 1 file, 8 tests passed.
- R33 mobile gate: 1 file, 3 tests passed.
- R33 PostgreSQL gate: 1 file, 3 tests passed.
- R13-R22/R28-R33 targeted unit regression: 13 files, 66 tests passed.
- Full shared mobile regression: 24 files, 94 tests passed.
- Serialized R13-R22/R28-R33 PostgreSQL regression: 16 files, 49 tests passed.
- Owner state survives a fresh aggregate read with the same fingerprint.
- Field work is assignment-gated and excludes owner/financial fields.
- A second workspace cannot be read through another membership.
- One fixture parses identically through the server/Web and shared mobile
  contracts; French/English catalogs are byte-equal across clients.

## Accessibility and presentation

- Web exposes semantic headings, ordered steps, `aria-current`, a labelled
  progress bar, explicit blocker alerts, focus targets, keyboard-safe links
  and wrapping/narrow layouts.
- Shared iOS/Android controls expose roles, labels, hints and busy states;
  primary controls retain a 48-point minimum target and screens scroll under
  narrow or enlarged-text layouts.
- Loading, unavailable and retry states are explicit. French and English copy
  stays complete and unmixed; unknown locales and missing copy fail closed.
- Workspace-timezone date and canonical CAD formatting are deterministic and
  identical across Web, iOS and Android.

## Final validation

- Root full unit suite: 135 files passed, 2 skipped; 1,959 tests passed, 2
  skipped.
- Root and mobile lint: passed.
- Root and mobile TypeScript: passed.
- Expo Doctor: 21/21 checks passed.
- Expo export: iOS, Android and Web passed; 51 static routes generated.
- Next.js 16 Webpack build: passed; 109/109 static pages generated, including
  `/client/cockpit` and the private
  `/api/endvera/v1/mobile/golden-workflow` route.
- Spec Kit Analyze: PASS; 6 user stories, 27 functional requirements, 12
  success criteria and 25 tasks, with zero critical or high finding.
- `git diff --check`: passed with line-ending notices only.
- `package-lock.json`, `apps/mobile/package-lock.json`, Prisma schema and
  migrations: unchanged; no dependency or database migration was added.

The first mobile export and Web build attempts intentionally failed closed
when mandatory compile-time environment values were absent. Final export and
build passes used process-local synthetic values only. No value was written to
the repository and no external request was made.

## External-effect and dashboard boundary

R33 reports `providerObserved: false` and `externalEffectCount: 0`. It adds no
provider client, credential, transport, external write, customer data, push,
Preview, Production, deployment or store action.

- strict canonical roadmap phase exits: 22%, unchanged;
- local AI engine build readiness: 46.75%, displayed 47%, unchanged;
- C2 preparation: 18/18 or 100%, unchanged;
- real provider/customer test readiness: `NO-GO`;
- Verified-E2E observed coverage: 0%.

R33 evidence remains `CODE + TEST + SYNTHETIC + DISPOSABLE POSTGRESQL`. It
does not prove real-device observation, customer value, provider behaviour,
store readiness, deployment, Production or Verified-E2E coverage.
