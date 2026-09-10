# UTC-naive datetime repair — exact inventory

2026-09-10. Local code/migration only; no historical data rewrite or external activation.

## Forward migration scope

`20260910100000_personal_utc_naive_datetime_fix` changes these 16 defaults to
`CURRENT_TIMESTAMP AT TIME ZONE 'UTC'`; matching Prisma defaults are explicit
`dbgenerated` expressions to prevent a future generated migration from undoing it.

- `AiUsage.createdAt`
- `AccountProviderSpendHold.createdAt`
- `AiOperation.createdAt`
- `ModelGatewayPolicyVersion.createdAt`
- `ModelGatewayRouteProfile.createdAt`
- `ModelGatewayOperation.createdAt`
- `ModelGatewayDecision.decidedAt`
- `ModelGatewayAttempt.startedAt`
- `ModelGatewayBreaker.changedAt`
- `ModelGatewayBreakerEvent.createdAt`
- `ModelGatewayAuditEvent.createdAt`
- `PersonalAssistantOperation.createdAt`
- `PersonalCalendarSmsConfirmationNonce.createdAt`
- `PersonalCalendarSmsConfirmation.createdAt`
- `PersonalAssistantBudget.createdAt`
- `PersonalAssistantDeliveryReceipt.createdAt`

It replaces only `calendar_confirmation_guard` and
`calendar_confirmation_final_binding`. Existing triggers/deferrability and all
non-datetime predicates remain. The unit regression reverses ONLY datetime
conversions and compares each entire function against the applied prior version.

## Shared defaults inventoried, intentionally unchanged

- `ConstructionWorkspace.createdAt`
- `ConstructionWorkspaceMember.createdAt`
- `ConstructionCommunicationIdentity.createdAt`
- `ConstructionConnectorAccount.createdAt`
- `ConstructionConnectorCredential.createdAt`
- `ConstructionConnectorGrant.createdAt`
- `ConstructionConnectorOperation.preparedAt`
- `ConstructionConnectorOperation.createdAt`

The personal confirmation authority pins member/workspace/identity/grant
`updatedAt` epochs, not these shared `createdAt` defaults. Those epochs are
explicitly maintained through Prisma and are not a reason to alter unrelated
shared defaults. This scoped repair makes no whole-repository UTC claim.

## Boundary rule

- Raw absolute Date parameters targeting/comparing a timestamp(3) column:
  `($n::timestamptz AT TIME ZONE 'UTC')`.
- SQL real clock written/compared to those columns:
  `(clock_timestamp() AT TIME ZONE 'UTC')`.
- Direct absolute clock SELECT and JSON instants retain their timezone. Two
  JSON instants compared as timestamptz remain unchanged.
- Existing rows may contain mixed Prisma-UTC and database-local provenance;
  this migration neither guesses corrections nor re-certifies their evidence.

## Validation boundary

Unit/static comparisons validate the intended narrow diff, not PostgreSQL
semantics. `utc-datetime.postgres.test.ts` requires the disposable harness and
prepares UTC/New_York/Tokyo round trips, future/expired/date-JSON equality and
all sixteen catalog defaults. The parent coordinates native execution; no
native PASS is inferred from these tests being written. Existing confirmation
and outbox behavior suites must pass with the native non-UTC default too.
