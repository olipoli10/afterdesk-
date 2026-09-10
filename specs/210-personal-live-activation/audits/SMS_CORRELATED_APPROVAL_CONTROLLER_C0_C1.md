# C0/C1 — controller review and native recovery evidence

2026-09-10. Local implementation evidence only; no provider, human approval,
Samsung, remote database or deployment observation.

C0 source, new test and audit fully reread. The exact draft schema moves into a
Zod-only leaf; legacy re-export keeps object identity. The three schema-only
consumers change import paths, not grammar or action semantics. Author232 focused
tests, types and scoped lint pass; four real import orders do not execute actions.

C1 production module, plan, author tests/audit and independent counter-tests/audit
fully reread. Global marker OR review OR approval classification precedes LIMIT;
the nested CASE does not run calendar serializers on legacy SMS/voice rows.
Recovery compares immutable approval binding, strict processing state and lease,
then makes an exact CAS to the closed UNCERTAIN/CLAIM_LEASE_EXPIRED result.
No current Google authority is required for bookkeeping, no budget is released,
and no attempt, transport or immutable proof is rewritten. SQL79 is unchanged.

Author27 plus reviewer7 tests pass. Reviewer mock/expression tests are not SQL
execution. Controller global TypeScript and scoped lint completed exit0 before
native execution. No source edits occurred during native validation.

## Native targeted run

`evidence/postgres-native-1789064872948/result.json`: exit0,
finished2026-09-10T18:29:09.051Z. Actual PostgreSQL17.11, **130/130 PASS**,
including nine new cases calling the production recovery function:

- CLAIMED and DISPATCH_CLAIMED in UTC, America/New_York and Asia/Tokyo;
- real WRITE revocation before bookkeeping, real database-clock lease expiry;
- original question expiry without extending its deadline;
- legacy result merge alongside the strict correlated result;
- two distinct PostgreSQL backend PIDs rendezvous before their actual recovery
  callbacks: exactly one recovered row, zero subsequent replay effects.

Transaction wrappers set the real session timezone or synchronize real PIDs;
they do not mock SQL results. Test-only synthetic approval fixtures implement the
already-verified SQL79 protocol; they are not a production approval caller or a
human decision. Complete approval/review rows, non-target operations, source and
question history, reservations and known transport values are compared unchanged.
The only prior synthetic transport belongs to the clarification-question fixture;
recovery itself sends nothing.

The owned disposable server reports STOPPED and its cluster is retained at
`.scratch/personal-pg-native-dc316aa6dda54ca295b4ad2b4eb11cbf`.
Full-suite validation at that snapshot was still in progress; the targeted result
was not a global PASS. Runtime claim/executor integration (C2), HTTP and mobile approval remain
separate unfinished work. No readiness metric is promoted.

## Full regression and strengthened native oracles

`postgres-native-1789064972660`: **326 PASS across20 isolated database clones**,
all exit0, one unchanged fingerprint79:41de317b70655965d494f1c3e0ea5940.
Finished18:33:10.549Z, server STOPPED; retained cluster
`.scratch/personal-pg-native-5afa71b28ae34d81a066ebbb12f36c75`.

Peer noted two coverage limits, not demonstrated product defects: simultaneous
start does not guarantee observing the SKIP LOCKED branch, and excluding the whole
target from snapshots left target immutable fields incompletely asserted. After
the full run ended, only tests were strengthened. The new preservation helper
compares the entire target row, permitting exactly status/result/lease/updatedAt
changes. A tenth case holds FOR UPDATE on the target in one actual backend while
awaiting production recovery on a different actual backend; recovery must return
zero before that holder can commit, leave all data unchanged, then recover one
after release and zero on replay. No sleep guesses establish this lock overlap.

Reviewer reread GREEN; controller TypeScript and lint exit0. Fresh targeted
`postgres-native-1789065279797`: **131 PASS**, finished18:35:56.279Z/STOPPED,
same frozen79 fingerprint. Held-lock case passes1193ms. Retained cluster
`.scratch/personal-pg-native-2fd5885de7e9406ba6462e0357ccb929`.
This is a full326 baseline plus a stronger131-file rerun, not a claimed full327 run.
No production or SQL change was made between those receipts.

Root regression `root-1789065389462` completes18:37:38.462Z with5389 PASS,
three unchanged historical skips and403 passing files. C0/C1 local source review
and regression are GREEN. C2/C3 implementation can now proceed with disjoint
ownership; this milestone is not project completion or live authorization.
