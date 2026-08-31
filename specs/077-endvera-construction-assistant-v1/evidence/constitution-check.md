# Constitution check

- Isolated worktree and `codex/` branch: satisfied.
- Additive, forward-only database change: satisfied; ten new Construction models and one migration, no destructive statement and no `prisma db push`.
- Canonical state lives in PostgreSQL, not in model memory: satisfied.
- Authorization is rechecked at every read/write boundary: satisfied by active workspace membership and verified communication identity checks.
- Consequential outbound action requires an exact versioned approval: satisfied; all delivery remains local and simulated.
- Auditability and provenance: satisfied; admitted mutations append content-minimized audit events in the same transaction.
- Existing economics, worker/QC and public workflows: unchanged.
- Dependencies and lockfile: unchanged.
- External provider, network, customer data, push, Preview and Production: not used.

Verdict: `CONSTITUTION_GREEN_LOCAL_ONLY`.
