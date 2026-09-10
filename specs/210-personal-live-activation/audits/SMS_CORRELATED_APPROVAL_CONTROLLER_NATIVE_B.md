# Correlated approval B — controller native evidence

2026-09-10, C:/dev/endvera-astra-r03. A is committed at
b063263b7f2d829540dc533432e47c172a6ee5ca; B remains an uncommitted local tranche.
No provider, secret, remote database, deployment, APK or human test involved.

## Gate and exact scope

Controller read the backend/mobile/design plans, all forward79 SQL, Prisma diff,
author static tests and both review audits. Independent pre-native review GREEN.
SQL79 SHA256 applied to the fresh disposable cluster:
`05163ed1dae6a7421ea3c2a1ecbd83cc7ed2abce77d6fda2cb4d34869060e1f7`.
Applied78 remains byte-identical. Forward79 native fingerprint:
`79:41de317b70655965d494f1c3e0ea5940`.

Fresh controller unit run14:07:04:127 PASS (A103+B17+peer7), TypeScript and scoped
lint PASS. Initial fixture TypeScript error referenced review.version; corrected
to the actual reviewVersion column before native execution. First Prisma validate
refused missing DIRECT_URL (P1012); supplying disposable placeholder URLs on
127.0.0.1 port1 for configuration-only validation passed. No connection or saved
secret lookup occurred. Prisma generation has not been performed for B yet.

## First actual native run — preserve partial failure

`evidence/postgres-native-1789063654307`:119 PASS /2 FAIL, finished18:08:50.198Z.
Real PostgreSQL17.11, isolated migrated template clone. Owned server STOPPED;
retained cluster `.scratch/personal-pg-native-565b7b554b454d868c4b5d8640ecb9b6`.

All sixteen NEW SQL protocol cases passed:

- previously committed review/approval/dispatch accepted across separate commits;
- same-TX review after assigned top XID, SAVEPOINT, RELEASE and prior outer write
  refused with exact committed-review error, even after early SET CONSTRAINTS;
- own SAVEPOINT claim cannot dispatch before parent commit; own dispatch cannot
  confirm before parent commit; reached booleans exclude unrelated early errors;
- two different native backend PIDs with controlled competing snapshots commit
  only one approval/claim, never two;
- DB UTC dates, actual-row JS/SQL fingerprint and state parity in UTC, Toronto,
  Auckland; no budget mutation;
- missing claim, JSON null authority, substituted origin and no-approval status
  changes roll back without approval or source/history mutation;
- duplicate approval, nonce/scope replacement and deletion refused;
- exact synthetic deterministic terminal shape accepted; wrong event ID and
  reopening terminal refused.

This is a synthetic-choice TABLE PROTOCOL. Actual existing SMS preparation is
used, but approval rows and transitions are deliberately written by test SQL.
The future runtime claim/HTTP CAS, human approval and Google call are NOT proved.
No XID wraparound test or arbitrary-XID commit oracle is claimed. The native
cases support only the documented visible-tuple SERIALIZABLE snapshot seam.

Both failures were old error-name oracles: forward79's BEFORE guard now rejects
marker replacement with CORRELATED_APPROVAL_OPERATION_IMMUTABLE, and a raw claim
without approval with CORRELATED_APPROVAL_REQUIRED. Previously the tests expected
78's marker/deferred-pending errors. Main changed only the two exact expected
names with explanatory comments; rollback/history assertions remain unchanged.
No guard, constraint, timeout or fixture authority was relaxed.

## Ongoing validation and next work

Fresh full20-file `postgres-native-1789063777614` completed18:13:01.013Z:
**317 PASS**, all20 clone exit codes0, one matching79 fingerprint. Temporal121
passed18:12:37.5171347Z, including both corrected error and unchanged preservation
oracles. Server STOPPED; retained cluster30509c3621824929ab9783d231de95d5.
First119/2 remains a distinct failed run; no SQL change between these runs.
Controller then generated Prisma6.19.3 into the verified non-junction owned
`.prisma-client` with fake loopback configuration only. TypeScript/scoped lint
PASS. Root `root-1789064045917` finished18:15:28.808Z:5348 PASS/3 historical skips,
401 passing files. No code was changed during these baseline runs.

SQL79/schema is now locally verified and frozen. Generic recovery still
uses its legacy result shape; typed execution must stay disabled until the narrow
recovery and same-executor integration are implemented and independently tested.
Historical result reading and mobile approval remain subsequent queue work.

Dashboard unchanged: roadmap22%, localbuild46.75%, C2 18of18,
real-test NO-GO, Verified-E2E0%. Heartbeat remains ACTIVE3min; campaign IN_PROGRESS.
