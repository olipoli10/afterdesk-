# Contract: Project Brain Local Gate R36Z

## Unique validator

```powershell
pwsh specs/191-project-brain-local-gate/scripts/validate-r36z-project-brain-local-gate.ps1
```

The validator accepts only explicit optional local paths/database parameters that pass its disposable ownership checks. It invokes the complete gate, validates the report and returns zero only for a valid `PASS`.

Each test may emit only one uniquely named fragment into the validator-created run directory or JSON stdout. The validator owns the exact fragment/assertion/mutation allowlists; duplicate, extra, missing or cross-run fragments are invalid. Tests cannot write the final report or terminal status. Only after cleanup is verified may the validator assemble a complete same-directory temporary report and atomically rename it to the final path.

## Machine-readable report

Path: `specs/191-project-brain-local-gate/evidence/local-gate-report.json`

Top-level strict shape:

```json
{
  "schemaVersion": 1,
  "release": "R36Z-PROJECT-BRAIN-LOCAL-GATE",
  "runId": "local-run-id",
  "status": "PASS",
  "evidenceLabels": {
    "code": true,
    "test": true,
    "synthetic": true,
    "founderObserved": false,
    "customerObserved": false,
    "providerObserved": false
  },
  "database": {
    "disposable": true,
    "ownershipVerified": true,
    "cleanupVerified": true
  },
  "assertions": [],
  "mutations": [],
  "commands": [],
  "effectCounters": {},
  "cleanup": {}
}
```

The example describes schema, not an executed verdict. Actual status and values must be derived from the run.

## Mandatory assertion groups

- `R36V-*`: intake, multi-source provenance, brief, exact confirmation, limitations.
- `R36W-*`: deterministic candidates, exact provenance/confidence, unconfirmed status.
- `R36X-*`: dispositions; the exact Friday/Monday `OWNER_TEXT` values and field/range provenances; explicit non-automatic contradiction declaration; preserved history; explicit resolution; exact sealed snapshot.
- `R36Y-*`: exact current-sequence/pointer recall/citations and visible `PREPARED_UNSENT` action.
- `RESTART-*`: fresh-process canonical hashes/counts.
- `REPLAY-*`: exact/concurrent/body-drift/stale behavior.
- `TENANCY-*`: second tenant/project, role, inactive and non-enumeration.
- `MOBILE-*`: visible one-flow navigation and zero technical-ID input.
- `ZERO-*`: every forbidden effect counter.
- `GATE-*`: targeted/full commands, mutation restoration, report schema and cleanup.

The validator keeps an internal complete allowlist of assertion and mutation IDs. Extra, duplicate, missing, skipped or unknown IDs invalidate the report.

## Commands

Each command record includes stable name, exact argv with secrets/redacted values removed, start/end time, exit code, test totals, skipped/pending totals and bounded output evidence path/hash. A zero exit with a missing expected assertion is not PASS.

## Closeout

Path: `specs/191-project-brain-local-gate/evidence/closeout.md`.

It is generated or checked only from the validated report and must state:

- exact local automated gate status;
- exact commands/counts and cleanup;
- `TEST`/`SYNTHETIC` evidence labels;
- founder/customer/provider observation absent;
- no external authority activated;
- no roadmap/readiness/Verified-E2E metric changed merely because the gate passed.

## Forbidden behavior

The validator must not use customer data, credentials, providers, network access, external transport/write, spending, push, Preview, Production, deployment or store action. It must not update backlog/queue/Brain or fabricate a Git SHA/verdict.
