# R38F closeout

Verdict: `LOCAL_SECRETARY_BROADCAST_APPROVAL_READY`.

An owner or admin can now inspect every masked recipient, the `SMS` channel and
the exact frozen text in the mobile Messages surface, then approve precisely
that version and payload hash. The canonical draft moves atomically from
`PREPARED_UNSENT` to `APPROVED_UNSENT` and records the approver plus one audit
event.

Identical command replay reconstructs the original result. A changed command,
a second approval, a stale version, a stale payload hash, a field worker or a
cross-workspace actor is refused. The field-worker projection reveals no
recipient or body detail.

Validation passed: 7 focused root unit tests, 181 mobile tests, 5 disposable
PostgreSQL integration tests, root and mobile typecheck, mobile and focused
server lint, Prisma schema validation, the 597-module provider boundary and
`git diff --check`.

No provider was called, no credential or customer data was used, and no SMS,
call, deployment, Preview, Production or store action occurred.
