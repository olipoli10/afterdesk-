# Quickstart: Project Brain Intake R36V

## Boundary

Use only a disposable local PostgreSQL database and synthetic files. Do not configure an AI, transcription, OCR, messaging or other external provider.

## Targeted validation

```powershell
npm test -- --run test/construction-operating-assistant-r36v-project-brain-contracts.test.ts test/construction-operating-assistant-r36v-project-brain-query.test.ts
npm --prefix apps/mobile test -- --run test/project-brain-intake.test.ts
```

Expected: strict contracts, truthful limitations, mobile one-surface flow and deterministic queries pass with zero provider or transport effect.

## Disposable PostgreSQL validation

Apply the forward migration to a fresh disposable database, then run:

```powershell
npm run test:integration:serial -- --run test/integration/construction-operating-assistant-r36v-project-brain.itest.ts
```

Acceptance scenario:

1. Create a synthetic workspace and project.
2. Create one intake.
3. Admit a PDF, two images and one short M4A fixture through separate commands.
4. Add an owner brief whose blocker and next decision appear nowhere else.
5. Submit for review and retain the exact fingerprint.
6. Confirm the exact version/fingerprint.
7. Recreate the client/process boundary and read the projection.
8. Ask for the blocker and next decision.
9. Replay all commands and race source/review operations.

Expected:

- one intake and one canonical effect per command;
- exact workspace/project binding;
- immutable source hashes and limitations;
- atomically confirmed snapshot/decision;
- byte-equivalent projection after restart;
- answer only from owner-confirmed fields;
- refusal to claim document/audio interpretation;
- zero external transport, provider execution, credential read or spend.

## Proportional final gates

```powershell
npm run lint
npm run typecheck
npm --prefix apps/mobile test
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run lint
npm run validate:provider-boundary
git diff --check
```

Run the full root suite and Next.js Webpack build before the local release is closed because this release adds a schema, migration and authenticated API boundary.

