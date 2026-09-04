# Quickstart: Project Brain Local Gate R36Z

## Single entry point

```powershell
pwsh specs/191-project-brain-local-gate/scripts/validate-r36z-project-brain-local-gate.ps1
```

Do not point the validator at a shared/persistent database. Do not configure credentials or providers. The script owns a unique disposable local database and must clean it up before returning PASS.

## Required gate sequence

1. Validate clean prerequisites, no secret input and disposable-resource ownership.
2. Create the synthetic two-tenant fixture with `L’unique inspection finale est vendredi à 09 h.` in `ownerBrief.summary` and `L’unique inspection finale est lundi à 09 h.` in `ownerBrief.importantDates`; retain both full-field ranges.
3. Run targeted R36V–R36Y contract/API/server/mobile suites.
4. Run the integrated positive chain through product boundaries; R36W copies both `OWNER_TEXT` fields, then the harness explicitly declares their incompatibility without auto-detection and proves both values/provenances survive resolution/seal.
5. Run genuine restart, replay/concurrency, body-drift, role and cross-tenant/project assertions.
6. Run fresh PostgreSQL integration/raw-SQL guard suites serialized.
7. Run mobile visible-control flow with zero technical-ID input.
8. Run and byte-exactly restore the mutation matrix.
9. Run provider-boundary validation, lint, typecheck, full serialized root/mobile tests and Next.js Webpack build.
10. Tests emit only isolated run-owned fragments/JSON stdout. The validator rejects non-allowlisted/duplicate/missing fragments, removes only owned resources, records cleanup probes, aggregates into a same-directory temporary report, atomically renames and validates it, then produces closeout.

## Mutation matrix

- `intake-source-or-brief-is-omitted`;
- `r36w-unconfirmed-candidate-becomes-truth`;
- `contradiction-member-or-history-is-erased`;
- `contradiction-fixture-is-vacuous-auto-detected-or-loses-exact-provenance`;
- `unresolved-contradiction-can-seal`;
- `assistant-reads-draft-or-stale-memory`;
- `citation-chain-is-missing-or-mismatched`;
- `prepared-action-hides-recipient-channel-or-body`;
- `prepared-action-approves-or-delivers`;
- `restart-reuses-same-process-state`;
- `replay-or-concurrency-duplicates-effect`;
- `cross-tenant-project-or-role-discloses-content`;
- `mobile-flow-requires-technical-id`;
- `provider-credential-network-or-semantic-binary-path-is-reachable`;
- `external-transport-write-or-spend-is-nonzero`;
- `missing-skipped-or-unknown-assertion-can-pass`;
- `test-writes-final-report-or-fragment-allowlist-is-bypassed`;
- `cleanup-target-is-not-owned`.

Every mutation requires a non-vacuous setup assertion, exact expected guard, failing gate, before/after SHA-256 equality and targeted green rerun.

## Expected evidence

- `evidence/local-gate-report.json`: strict machine truth.
- `evidence/mutations.md`: exact mutation/guard/restoration record.
- `evidence/closeout.md`: short report derived only from validated JSON.

A successful automated gate remains `TEST`/`SYNTHETIC`. Founder, customer and provider `OBSERVED` evidence remain absent and readiness metrics do not increase automatically.
