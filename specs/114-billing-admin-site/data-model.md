# R34 Data Model

## Code-owned `ConstructionCommercialPlanDefinition`

- `planKey`, `version`, `canonicalHash`
- localized display-key references, never persisted display prose
- closed included feature keys
- closed usage metric keys
- `priceState=PRICE_NOT_SET`
- `monthlyPriceMinor=null`, `currency=CAD`
- `billingProvider=DISABLED_LOCAL`
- `status=AVAILABLE_LOCAL`

## `ConstructionCommercialAccount`

- unique `workspaceId`
- `planKey`, `planVersion`, `planHash`
- `state`: `PREPARED | INTERNAL_TRIAL | SUSPENDED | CANCELLED`
- `periodStartsAt`, `periodEndsAt`
- `accountVersion`
- exact `featureSnapshot`, `usageMetricSnapshot`
- `priceState`, nullable `monthlyPriceMinor`, `currency`
- `billingProvider=disabled_local`
- `createdById`, timestamps

One workspace has one current account. No state claims payment or provider
activation. State transitions increment `accountVersion` atomically.

## `ConstructionCommercialDecision`

- `workspaceId`, `accountId`, unique `commandId`
- `kind`: `ASSIGN_PLAN | CHANGE_PLAN | CHANGE_STATE`
- `expectedAccountVersion`, `resultingAccountVersion`
- exact `priorSnapshot`, `nextSnapshot`
- `actorId`, `decisionFingerprint`, `createdAt`

Rows are immutable. Duplicate command with the same fingerprint returns the
same result. Same command with a different fingerprint refuses.

## Derived `ConstructionUsageProjection`

No table. A repeatable-read aggregate returns a stable, hashed projection:

- `ACTIVE_PROJECTS`
- `ACTIVE_MEMBERS`
- `INGESTED_MESSAGES`
- `EVIDENCE_REFERENCES`
- `PREPARED_ACTIONS`
- `OPEN_FOLLOW_UPS`
- `HUMAN_ESCALATIONS`

Each reading contains `quantity`, `sourceClass`, period and `observedAt`.
Quantities are informational and cannot create an amount due.

## Projections

- `OWNER_COMMERCIAL_ACCOUNT`: account, plan capabilities, usage, support summary, provider/effect zero.
- `ADMIN_COMMERCIAL_PORTFOLIO`: ordered workspace summaries, attention reason, exact local actions.
- No field-worker commercial projection. Access is refused before serialization.
- `PUBLIC_CONSTRUCTION_OFFER`: typed localized claims only; no tenant data.
