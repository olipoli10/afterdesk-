# Android device calendar bridge — implementation plan

## Outcome

A verified owner links one Android installation to one active workspace. A
calendar proposal prepared from the owner's normal SMS remains inert until the
owner approves its exact title, start, end and timezone. The server then issues
one short-lived directive to that exact device. A generic notification only
wakes the app; the app retrieves the directive through its authenticated
session, rechecks Calendar permission and the selected writable calendar,
attempts the native write once, and records a terminal receipt.

## Authority boundaries

- OpenRouter proposes structured intent only; it cannot approve or execute.
- Twilio proves the inbound channel and sender binding only; an inbound SMS is
  not action authority.
- The owner approval binds the exact operation id and request hash.
- Push carries no event payload, credential, approval or directive id.
- The device secret is generated locally and stored in SecureStore. The server
  stores only its hash; the push token is encrypted at rest.
- A native result that cannot be proven becomes `uncertain`; it is never
  automatically retried.
- Google Calendar remains an optional server-side route. The linked Android
  Calendar Provider is the primary write route for the phone.

## Delivery sequence

1. Register or rotate one Android device binding and record current native
   permission capabilities.
2. Select a writable calendar on the device; never guess when selection is
   missing or stale.
3. Prefer the active device bridge for new SMS calendar-write proposals.
4. Approve the exact stored proposal and create exactly one durable directive.
5. Wake the device with a payload-free notification; foreground polling remains
   a recovery path.
6. Claim the directive once, journal the claim locally, execute the native write
   once, and post a completed or uncertain receipt.
7. Revoke the binding by rotating its state and refusing pending directives.

## Validation gates

- Unit contracts reject unknown fields, invalid time ranges and weak device
  credentials.
- PostgreSQL tests prove owner/workspace/device isolation, replay refusal,
  revocation, one claim, one terminal receipt and no second native authorization.
- Mobile tests prove writable-calendar selection, permission recheck, local
  journal recovery and no automatic retry after a native attempt.
- TypeScript, lint, scoped tests and a new internal Android build must pass.
- Live SMS, push delivery and physical calendar mutation remain unproven until a
  separately recorded owner observation succeeds.

