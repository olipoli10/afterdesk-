# R37H — Provider trusted clock boundary

## Scope

Remove caller-controlled timestamps from the public R37B activation/spend commands and the public R37C controlled-run command. Time-sensitive authorization, expiry, reservation and lease decisions must use a server-owned clock. Deterministic tests may inject a clock only through an explicit internal dependency that is separate from parsed command data.

## Exclusions

- No provider, credential, network, external transport or external write.
- No customer or prospect data.
- No schema, migration, dependency or lockfile change.
- No route, deployment, Preview, Production or store action.

## Functional requirements

- **FR-001**: Every R37B public command schema must reject an unknown `now` field.
- **FR-002**: The R37C public execution schema must reject an unknown `now` field.
- **FR-003**: R37B expiry, activation, reservation, revocation, lane-control and terminal timestamps must come from a server-owned clock dependency.
- **FR-004**: R37C lease claim, lease expiry, recovery and point-of-use authorization checks must use one server-owned time reading per execution attempt.
- **FR-005**: Internal deterministic tests may inject a trusted clock as a function argument separate from raw command data.
- **FR-006**: Invalid internal clock values must fail closed before a canonical write or adapter call.
- **FR-007**: Existing tenant, idempotency, spend, replay, lease and canonical-evidence guarantees must remain intact.

## Success criteria

- **SC-001**: All six affected strict public schemas refuse caller-controlled time.
- **SC-002**: Targeted R37B-R37H unit and disposable-PostgreSQL tests pass.
- **SC-003**: Existing R37 provider unit and integration tests pass without provider or network access.
- **SC-004**: Typecheck, lint and `git diff --check` pass; Prisma and package locks remain unchanged.

## Authorization, tenancy and data class

Authority is local code, tests, disposable PostgreSQL and local Git commits only. Existing owner/admin and workspace checks remain mandatory. Test material is synthetic business-confidential data only.

## Failure and exception behavior

Raw caller timestamps are rejected by strict validation. A missing clock uses the system clock. A supplied internal clock that throws, returns an invalid date or returns a non-Date value fails closed with `R37_TRUSTED_CLOCK_INVALID`.

## Economics, verification and delivery

Integer-microdollar ceilings remain unchanged. Verification is automatic and local. Delivery is source code plus tests and evidence; no external delivery occurs.

## Observability, rollout and rollback

Audit timestamps remain database/server-derived. Rollout is local-only behind the existing provider-disabled boundary. Rollback is the exact local commit reversal before any provider authority.
