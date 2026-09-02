# Research and Reuse Decisions

## R3 is the canonical connector authority foundation

R3 already persists workspace-scoped connector accounts, capability grants and
immutable operations. It also prepares deterministic Google Calendar requests,
separates read/write scopes, clears secret references on local revocation and
hard-disables execution. R23 extends this path instead of introducing another
OAuth or connector engine.

## R16 and R17 remain canonical UI safety layers

R16 already exposes secret-free permission and connector readiness state. R17
already provides protected, workspace-bound, restart-safe command persistence.
R23 composes both for the native calendar-connector cockpit.

## Provider differences remain behind adapters

Google uses Calendar API event scopes, `syncToken`, event `etag` and
`sendUpdates=none`. Microsoft Graph uses Calendars scopes, delta links and
`If-Match` change tags. Public R23 contracts expose common capabilities and
dispositions while provider-specific builders retain the exact native request
shape. No provider SDK is needed to prepare those shapes.

Official provider documentation was rechecked on 2026-09-01:

- Google Calendar authorization scopes distinguish event read-only from event
  write access: https://developers.google.com/workspace/calendar/api/auth
- Google incremental synchronization uses opaque sync tokens and requires a
  new full synchronization after an expired token returns HTTP 410:
  https://developers.google.com/workspace/calendar/api/guides/sync
- Microsoft Graph distinguishes `Calendars.Read` and `Calendars.ReadWrite`:
  https://learn.microsoft.com/en-us/graph/permissions-overview
- Microsoft calendar-view delta tracking is range-bound and returns opaque
  next/delta links:
  https://learn.microsoft.com/en-us/graph/delta-query-events

These sources support deterministic request preparation only. They are not
evidence of a live provider connection.

## No live OAuth in R23

OAuth would require credentials, redirect registration, a secret store,
provider network traffic and external authority. R23 therefore stops at an
exact consent plan and locally testable adapter contract. Observed provider
activation remains R37 work.

## Secret minimization

Raw access/refresh tokens, authorization codes, sync tokens and provider event
identifiers are not needed in the mobile cockpit or audit. Only opaque secret
references and non-reversible binding fingerprints may be persisted.
