# Owner SMS calendar autocreate plan

## Decision and authorization

- `DECISION` — On 2026-09-13, Olivier explicitly requested that a calendar
  event sent from his verified owner SMS number be created without a separate
  per-event approval in the app.
- This is a revocable standing approval for one capability only:
  `CREATE_ONE_DEVICE_CALENDAR_EVENT_FROM_VERIFIED_OWNER_SMS_V1`.
- It does not authorize invitations/attendees, recurring events, updates,
  deletions, texts to contacts, calls, or any action inferred from an ambiguous
  request.
- The standing approval is active only while the dedicated server switch and
  its exact authority reference are current, the personal pilot is current,
  and the owner/device/calendar grants remain active.

## Problem

`OBSERVED` — SMS source `cmu0dzmp60001jr04cd9o0qdk` was received on
2026-09-13 at 22:29:37Z. The stored model proposal and deterministic temporal
resolver produced exactly one event for 23:00–00:00 America/Toronto, but the
device-calendar operation stopped at `pending` and the reply instructed the
owner to approve it in the app.

## Accepted behavior

1. Reinspect the current stored SMS identity, owner/workspace binding, model
   proof, source quotes, deterministic time result, calendar operation, device
   account, and write grant in the source's serializable commit transaction.
2. Admit only one `PREPARE_CALENDAR_EVENT` whose source is an explicit
   add-to-calendar command and whose start, end, title, timezone, request hash,
   and operation binding match the stored proof exactly.
3. Require a future event, a positive duration no longer than 24 hours, no
   dependencies, and a device-calendar create-only payload with no attendee or
   recurrence fields.
4. Convert that exact pending operation once into an Android device directive,
   then wake the associated device when push is available. The device's
   existing one-shot claim and receipt journal remain the only native writer.
5. Reply that automatic addition was launched and that no app approval is
   required. Do not claim the native event is confirmed until the device receipt
   records completion.
6. If any check is ambiguous, unavailable, revoked, stale, or changed, keep the
   existing clarification/app-review behavior and perform no calendar write.

## Failure and recovery

- The calendar operation and directive remain one-shot and idempotent.
- A claimed native write is never retried automatically after an unknown
  outcome.
- No old prepared operation is replayed during rollout.
- Disabling either autocreate switch, revoking the owner identity, unlinking the
  phone, removing calendar permission, or revoking the calendar-write grant
  stops new automatic creates.

## Verification

- [x] T001 Add pure closed-grammar and policy tests.
- [x] T002 Add a disposable PostgreSQL proof for exact owner/source/device
  binding and one-shot directive preparation.
- [x] T003 Wire the source worker without changing other action types.
- [x] T004 Prove flag-off, non-calendar, multi-action, ambiguous, past/oversized,
  revoked, changed, and replay cases fail closed.
- [ ] T005 Run focused tests, typecheck, lint, provider-boundary validation, and
  production build.
- [ ] T006 Deploy the exact commit with the narrow standing-authority switches.
- [ ] T007 Observe one new owner SMS through device receipt; until then,
  `Verified-E2E` remains zero for automatic calendar creation.

## Rollback

Set `ENDVERA_OWNER_SMS_CALENDAR_AUTOCREATE_ENABLED=false` or remove the exact
authority reference. Existing pending/claimed directives retain their original
one-shot recovery semantics; rollback never replays or deletes an event.
