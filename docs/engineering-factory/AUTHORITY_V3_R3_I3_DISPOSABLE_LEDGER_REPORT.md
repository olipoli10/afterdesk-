# Authority V3 R3 I3 — disposable ledger implementation report

Status: **LOCAL DISPOSABLE LEDGER ONLY**

Execution authority: **false**

Provider calls: **0**
Real candidate invocations: **0**

## Decision

I3 is implemented only for operating-system temporary directories with a
simulated file anchor. It proves the R3 transaction and recovery semantics in a
disposable local environment. It is not TPM evidence, production durability,
or permission to execute any candidate.

## Implemented contract

- exactly five logical SQLite tables from the R3 replay-ledger schema;
- WAL, `synchronous=FULL`, 4096-byte pages and the R3 application ID verified
  on open and again before transitions or recovery;
- `BEGIN IMMEDIATE` T1 preparation, FULL checkpoint, database/WAL fsync,
  independent second-handle readback, simulated anchor advance and T2
  compare-and-swap finalization;
- atomic reservation, terminal consumption and lease release;
- exact transition table plus database triggers for invalid state changes,
  committed-event mutation/deletion and release without a committed terminal
  event;
- one held lease per concurrency domain, with safe reuse only after release;
- exact recovery of the one prepared transaction after all three simulated
  crash boundaries, followed by a separate anchored `CONSUMED_FAIL`;
- fail-closed stale-backup, foreign-machine, corrupt-database, invalid storage
  identity, boot-drift, expiry/approver-timeout, replay and terminal-duplicate
  handling;
- `CONSUMED_PASS` requires a valid review-root hash, cleanup `true`, and exactly
  23 passed gates.

## RED evidence

The I3 suite was first observed RED because the durable-ledger module did not
exist. The expanded crash matrix then exposed a real implementation defect:
after `T1_COMMITTED`, recovery calculated the fsync receipt but attempted to
advance the simulated anchor using the earlier receipt-less object. The named
test `recovers a T1_COMMITTED reservation crash exactly once and consumes it as
failed` failed with `E_LEDGER_PREPARE_NOT_DURABLE`. The recovery path now passes
the independently read-back durable preparation to the anchor step.

## Named mutations

The following compiling mutations each failed their exact targeted test before
the source was restored byte-exactly:

1. `i3-cross-machine-binding-bypass`
2. `i3-pass-gate-count-bypass`
3. `i3-recovery-consume-fail-bypass`
4. `i3-application-id-bypass`
5. `i3-stale-backup-bypass`
6. `i3-held-lease-overwrite`

The pristine source SHA-256 after every restoration was:

```text
3fb4d57830363b2232dbeaed5589080404d30112c928af1b6b633472bd8dc210
```

## Pristine validation

- I3 targeted suite: 14/14 PASS.
- Full repository suite: 75 files PASS, one skipped; 1,321 tests PASS, one
  skipped.
- TypeScript: PASS.
- ESLint: zero errors; two pre-existing warnings in `bakeoff.ts`.
- `git diff --check`: PASS.
- Lockfile: unchanged.

## Explicit durability limitation

Windows rejects directory-handle fsync in this environment. The disposable
receipt therefore records
`directoryFsync: SIMULATED_DISPOSABLE_WITNESS_ONLY`. Database and WAL file
fsync plus independent reopen/readback are real local operations; directory
durability and the external anchor are simulated. This limitation is why the
result remains I3 disposable evidence and cannot satisfy a future real TPM or
production-ledger authority.

## Not authorized or exercised

- no TPM/NV index, quote, key, PCR or machine authority;
- no WSL, container, firewall, relay or privileged service;
- no real or synthetic candidate process in I3;
- no provider, credential, prompt, model output or client data;
- no shared database, Preview, Production or master update.
