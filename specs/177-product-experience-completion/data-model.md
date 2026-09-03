# Data Model: Product Experience Completion

No database entity or migration is introduced.

## PublicProductCopy

- `locale`: `fr-CA` or `en-CA`
- `eyebrow`, `headline`, `promise`: primary proposition
- `channels[]`: title, explanation, and local availability state
- `outcomes[]`: persistent context, next work, prepared communications, and bounded human support
- `trustTitle`, `trustBody`: approval and external-action boundaries
- `availability`: local-build and external-dependency statement
- `cta`: account creation and sign-in labels

Validation: both locales expose the same number of loop steps and capabilities; no item may claim live provider, customer, store, or production evidence.

## MobileDestination

- `route`: stable Expo Router path
- `label`: user-facing French label
- `group`: `PRIMARY`, `WORK`, `COMMUNICATIONS`, `MONEY`, `TRUST`, or `ACCOUNT`
- `roleVisibility`: existing screen-level role rule
- `externalState`: existing fail-closed provider state

Transition: a route changes only from visible primary tab to hidden deep-link route. No operational state transition changes.

## ReleaseTruthBoundary

- local code present
- automated test observed
- synthetic path observed
- provider observed false
- customer observed false
- signed false
- deployed false
- published false
