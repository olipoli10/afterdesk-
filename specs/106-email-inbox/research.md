# R26 Research and Decisions

## Decision: provider-neutral, narrow project access

Gmail exposes messages, threads, history, drafts and watch operations, while
Microsoft Graph offers per-folder message delta. ENDVERA therefore models a
small normalized boundary instead of copying either provider's object model.
R26 prepares Google/Microsoft account kinds locally but does not authorize OAuth
or provider traffic.

Primary references (accessed 2026-09-02):

- Gmail API guide: https://developers.google.com/workspace/gmail/api/guides
- Gmail REST resources: https://developers.google.com/workspace/gmail/api/reference/rest
- Microsoft Graph message delta: https://learn.microsoft.com/en-us/graph/delta-query-messages

## Decision: cursor is opaque and recovery is explicit

Gmail partial synchronization uses `historyId`; an unavailable/stale start ID
can require a full resynchronization. Microsoft Graph returns opaque `nextLink`
and `deltaLink` tokens scoped to a folder. ENDVERA stores only a derived opaque
cursor reference and a `SYNC_REQUIRED` state, never a raw provider URL or an
invented continuity claim.

- Gmail sync: https://developers.google.com/workspace/gmail/api/guides/sync
- Microsoft Graph message delta: https://learn.microsoft.com/en-us/graph/delta-query-messages

## Decision: no push/webhook in R26

Gmail push uses Cloud Pub/Sub, watch renewal and a recovery path for delayed or
dropped notifications. That is provider infrastructure and operational
authority absent from R26, so the contract accepts only locally authenticated
normalized events.

- Gmail push notifications: https://developers.google.com/workspace/gmail/api/guides/push

## Decision: capability separation and least privilege

Gmail mailbox scopes can be sensitive/restricted. Microsoft separates basic
metadata read, full mail read/write and send permissions; `Mail.ReadWrite` does
not itself include send. ENDVERA mirrors this separation as metadata,
selected-content, prepare-draft and send capabilities, with send disabled.

- Gmail scopes: https://developers.google.com/workspace/gmail/api/auth/scopes
- Microsoft Graph permissions: https://learn.microsoft.com/en-us/graph/permissions-reference

## Decision: selected attachments only

R26 never downloads remote parts. An attachment becomes operational evidence
only after it is explicitly selected and admitted by the existing R14 file
security path, then linked under the same workspace/project.

## Rejected alternatives

- Reusing `src/lib/email.ts`: it is a transactional notification sender, not a project inbox.
- Broad mailbox mirror: too much authority and data for the product outcome.
- Provider-specific canonical rows: creates two sources of truth and brittle workflows.
- Parsing unverified HTML/attachments into facts: violates canonical evidence and no-invention rules.
- Provider-side drafts in R26: external write without authority.
