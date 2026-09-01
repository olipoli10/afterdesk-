# Data model

## ConstructionReceivable

One canonical invoice balance with workspace/project/contact ancestry, frozen
invoice reference/currency/original amount, current outstanding amount, status,
version and idempotency key.

## ConstructionReceivableEvent

Immutable append-only `issued`, `payment_received`, `promise_to_pay`, `disputed`
or `note` evidence. Money-changing events carry amount and resulting balance.

## ConstructionFollowUp

Exactly one parent: receivable or open loop. Stores kind, due date, channel,
status, attempt, contact, frozen body and optional prepared action binding.

## Invariants

- amount and outstanding balance are positive/non-negative and same currency;
- payment cannot increase or make the balance negative;
- event deletion/truncate is refused;
- one follow-up cannot target both/no parent;
- a prepared action binding is immutable and replay-safe.
