# R37I — Provider expired-lease fencing

## Scope

Close security finding `csf_07a831cefdcb51ae08bfbb9e`: an asynchronous provider adapter that returns after its lease expires must not persist canonical evidence, settle spend or conceal the overrun with a backdated terminal timestamp.

## Requirements

- **FR-001**: Read trusted server time again after asynchronous adapter completion.
- **FR-002**: Every R37F canonical-evidence read/write under an active lease must require the exact token and `leaseExpiresAt` strictly later than fresh callback time.
- **FR-003**: The R37C evidence transition must require the exact token and an unexpired lease at fresh terminal time.
- **FR-004**: Expired work must persist no canonical evidence, settle no spend and must release its exact reservation.
- **FR-005**: Terminal settlement, release and completion timestamps must use fresh terminal time, not invocation-start time.
- **FR-006**: Caller-controlled time remains rejected; deterministic time remains an internal dependency only.
- **FR-007**: Tenant, replay, concurrency, revocation and successful-delivery behavior remain unchanged.

## Success criteria

- A paused adapter advanced beyond its lease returns a bounded failed result, zero canonical evidence and a released spend attempt.
- Successful, replayed, concurrent and stale-token cases still pass on disposable PostgreSQL.
- All R37 tests, root unit tests, typecheck, lint and diff checks pass.

## Boundaries

Local code, tests, disposable PostgreSQL and local commits only. No provider, credential, customer data, network, external write, schema, migration, dependency, lockfile, route, push, Preview, Production or deployment.
