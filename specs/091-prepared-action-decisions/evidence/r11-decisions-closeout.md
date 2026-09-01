# R11 closeout — exact prepared-action decisions

Status: `DONE`

Implemented one authenticated mobile decision endpoint and one canonical
transactional service for `APPROVE`, `REJECT` and `REVOKE`.

Each command binds the workspace, action, version and fingerprint. PostgreSQL
advisory locking, conditional updates and bounded serializable-conflict retry
make concurrent retries converge on one transition. The audit trail records the
command, decision and exact fingerprint. Reusing a command ID with changed
input fails closed.

`APPROVE` yields `APPROVED_UNSENT`; reject-before-approval and
revoke-after-approval never dispatch. Field workers and cross-workspace actors
cannot decide. Every result states `externalTransportPerformed: false`.

Validation on the final R11 source:

- unit: 2 files, 7 tests passed;
- disposable PostgreSQL: 1 file, 3 tests passed, including concurrent approval;
- affected ESLint: passed;
- TypeScript: passed;
- no schema, migration, dependency or lockfile change;
- no provider, credential, external transport, customer data or external write.
