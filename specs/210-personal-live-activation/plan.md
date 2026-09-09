# ENDVERA personal live activation

Olivier's 2026-09-09 instructions: start the personal SMS/calendar/voice service
and resume this task every three minutes until its actual completion.

## Outcome

Olivier uses his Samsung Messages app to contact an ENDVERA number, asks about
his connected calendar, adds an event, and approves an exact SMS or voice call.
The installed app handles account connection, selected device permissions,
approval and history. No personal-SIM SMS access is required.

## Reconciled starting point

- Product: C:\dev\endvera-astra-r03, 4f031877 (clean at admission).
- Brain: C:\dev\afterdesk-project-brain, eed3f3b (clean at admission).
- Historical spec209 is complete locally; its no-timer restriction belonged to
  that finished scope. The new explicit instruction authorizes this heartbeat.
- App goal API still holds an old blocked global objective. Do not mark it
  completed merely to replace it. This plan and queue track the current scope.
- Current Google connector prepares requests but throws on transport. Existing
  communications ingress is authenticated local JSON, not a Twilio webhook.
- No Twilio/Google/backend credentials found in the current process and only
  .env.example exists in this checkout. This is not an inventory of remote vaults.
- node_modules is a shared junction: do not mutate its target while installing.

## Sequence

1. Implement bounded, signed Twilio ingress with account/number matching,
   verified identity binding and durable duplicate protection.
2. Complete Google OAuth with server token encryption, state binding, refresh
   and revoke; reuse existing calendar request builders and workspace checks.
3. Connect SMS to the existing guarded assistant, durable jobs and exact
   approvals; implement bounded outgoing Twilio transport and delivery receipts.
4. Configure a reachable HTTPS backend, database/storage and the Android build.
5. Connect Olivier's accounts and provision/verify the number after the concrete
   account, spend ceiling and approved recipients are available.
6. Observe inbound SMS, real calendar query/write/sync, approved self-recipient
   SMS and voice, duplicate refusal and app login. Preserve failures.

## Authority and completion

The user requested personal go-live and the timer. Continue local work and
prepare concrete external configuration without routine GO requests. No old
R37 budget applies. No number purchase or paid trial without a current CAD
ceiling. No third-party message/call without approved recipients. Secrets stay
server-side and never appear in command output, commits or model prompts.

Complete only when all observed outcome criteria pass. Local tests do not prove
live readiness. Record missing owner inputs once while continuing independent
work. Keep unchanged heartbeat runs quiet. No new historical founder test.

Official references checked: https://www.twilio.com/docs/usage/security,
https://www.twilio.com/docs/messaging/guides/webhook-request,
https://developers.google.com/workspace/calendar/api/auth.
