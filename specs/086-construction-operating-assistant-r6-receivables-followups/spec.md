# ENDVERA Construction Operating Assistant R6 — Receivables and follow-ups

## Outcome

ENDVERA keeps a canonical construction receivable balance, records every
payment-changing event with provenance, knows when a receivable or missing
piece of evidence needs follow-up, and prepares exactly one approval-gated
action when the follow-up becomes due. No external transport occurs in R6.

## P1 — Persistent receivable memory

An owner or office manager records an issued invoice and later records partial
or full payments. PostgreSQL retains the immutable events and current balance.

- retries/concurrency create one invoice or payment effect;
- a payment cannot exceed the outstanding balance;
- partial payment reduces the balance and full payment closes it;
- stale versions, cross-workspace references and unsupported currencies fail;
- the field-worker projection omits invoice reference and all money.

## P1 — Durable follow-up policy

An owner schedules a follow-up for either one receivable or one open-loop
evidence gap. At due time ENDVERA prepares one exact action bound to the right
project/contact/context.

- exactly one target is required;
- the schedule survives restart;
- concurrent due sweeps produce one action;
- the action remains `PREPARED_UNSENT` and approval-required;
- completing the underlying receivable cancels its unprepared follow-ups;
- zero provider, network, SMS, email or call is emitted.

## Authorization and safety

Construction owners/admins may mutate their own workspace. Members and field
workers receive role-shaped projections only. Raw credentials are never stored.
All canonical changes and prepared actions are auditable and idempotent.

## Non-goals

Payment processing, accounting sync, invoice generation, real reminders,
Twilio, email, calling, OAuth, customer data, mobile UI, push, Preview,
Production and deployment.

## Success

- Marc owes 8,450 CAD; a 5,000 CAD payment leaves exactly 3,450 CAD;
- one due sweep creates one `PREPARED_UNSENT` follow-up under concurrency;
- state is identical after reconnect;
- zero invented fact, financial leakage, cross-workspace effect or transport.
