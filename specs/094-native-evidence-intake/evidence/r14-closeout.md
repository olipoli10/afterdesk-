# R14 Closeout — Native Secured Evidence Intake

## Result

R14 adds a native `Preuves` surface to the iOS/Android/Web Expo client. An
authorized construction member chooses one visible open dossier, one evidence
kind and one local file. The command is bound to the exact workspace, project,
open loop and expected state version. The admitted evidence remains
`PRESENT_UNVERIFIED`; selection never implies verification or invoice readiness.

The server authenticates the CLIENT session, requires active workspace
membership before inspecting replay state, validates a strict multipart
envelope, enforces a 10 MiB limit and accepted JPEG/PNG/PDF/DOCX types, scans and
sanitizes bytes, stores the evidence through local object storage, and commits
the File, access log and canonical open-loop transition in one serializable
PostgreSQL transaction. A stable command ID provides exact retry without a
second canonical effect.

## Observed gates

- mobile tests: 23/23 passed, including 5 R14 evidence contract/attempt tests;
- R0/R7/R8 unit gates: 25/25 passed;
- disposable PostgreSQL R0/R7/R8/R14 integrations: 13/13 passed on 45 migrations;
- mobile lint: passed;
- mobile and root typecheck: passed;
- Expo Doctor: 21/21 passed;
- local Expo export: iOS, Android and Web passed with an inert HTTPS build URL;
- queue validation: `CONTINUATION_REQUIRED`, `INVALID=0`;
- `git diff --check`: passed.

## Security and authority

- exactly one new dependency: Expo-compatible `expo-document-picker` 57.0.1;
- only the file explicitly selected by the user is accessible;
- cross-project and outsider commands fail closed;
- same-command drift in bytes, kind, file name or source is refused;
- field workers may contribute unverified evidence but receive no financial
  projection;
- no provider, OAuth, mailbox, broad gallery access, customer data, external
  transport, push, Preview, Production, deployment, EAS or store action.
