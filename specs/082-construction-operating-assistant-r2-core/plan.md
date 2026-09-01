# Implementation plan

1. Extend the existing deterministic command contract for today, reminders, and rescheduling.
2. Reuse `ConstructionMessage`, `ConstructionInterpretation`, `ConstructionCalendarItem`, `ConstructionAction`, and the audit ledger; add only forward-compatible enum values.
3. Add one provider-neutral command service and authenticated API route.
4. Add one mobile-first assistant page with conversation, agenda, reminders, connector status, and approval outbox.
5. Validate contracts, interpreter behavior, persistence boundaries, typecheck, lint, and build.

No live provider, credential, external transport, push, preview, or production action is part of this block.
