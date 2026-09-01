# ENDVERA Construction Operating Assistant R2 Core

## Objective

Turn the existing persistent construction memory into one useful operating-assistant surface. A client can issue a portal, SMS, email, or voice-transcript command; ENDVERA interprets it, applies only authorized internal changes, prepares external communication for approval, and answers from canonical PostgreSQL state.

## User outcomes

- Ask what is scheduled today or tomorrow and receive a database-backed answer.
- Add a precise appointment.
- Create a reminder with a precise time.
- Reschedule one unambiguous appointment while retaining source history.
- Prepare a text message to a known contact without sending it.
- See recent conversation, agenda, reminders, and approval-required actions on one mobile-first page.
- Use the same command envelope from portal and future SMS, email, and voice adapters.

## Safety and authority

- Internal low-risk records may be written for an active workspace member with `COMMAND` permission.
- External communication is always `PREPARED_UNSENT` until an exact approval is recorded.
- No connector performs network transport in R2.
- Ambiguous dates, times, projects, contacts, or reschedule targets cause clarification and no consequential write.
- Every command is idempotent and auditable.

## Acceptance

- Today and tomorrow answers are derived from PostgreSQL, not the chat transcript.
- Duplicate command IDs create no duplicate canonical effect.
- Reminder and reschedule commands persist across process restart.
- Outbound drafts expose recipient, channel, and exact body before approval.
- Connector capabilities report configured authority honestly; unavailable connectors fail closed.
- Cross-workspace access is refused.
