# Tasks — Android device calendar bridge

## Phase 1 — Contract and storage

- [x] DCB001 Add strict shared registration, directive and receipt contracts.
- [x] DCB002 Add durable device binding and directive storage using the existing
  connector credential vault and personal operation ledger.
- [x] DCB003 Add authenticated register, status, claim, receipt and revoke API
  routes.

## Phase 2 — Native Android executor

- [x] DCB004 Add SecureStore device identity and native writable-calendar
  selection.
- [x] DCB005 Add the one-attempt native calendar executor and durable local
  receipt journal.
- [x] DCB006 Wake/reconcile on foreground and generic ENDVERA notification.
- [x] DCB007 Expose binding, selected calendar and latest receipt state in the
  device-access screen.

## Phase 3 — SMS-to-device wiring

- [x] DCB008 Prefer the active Android device account when preparing new SMS
  calendar-write proposals.
- [x] DCB009 Route exact owner approval to one device directive while retaining
  the existing Google path as optional fallback.
- [x] DCB010 Add the disabled-by-default generic Expo push wake adapter.

## Phase 4 — Verification and delivery

- [x] DCB011 Add unit and native PostgreSQL isolation/replay/uncertain tests.
- [x] DCB012 Run scoped tests, mobile typecheck/lint, root typecheck and provider
  boundary validation.
- [ ] DCB013 Record evidence, commit locally, build one new internal Android APK
  and update the canonical Brain without inflating live metrics.
