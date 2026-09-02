# R26 Contract

## Local account command

Requires schema version, stable command ID, workspace, provider kind, opaque
account/mailbox scope and requested capabilities. Preparation always returns
`PREPARED_DISABLED`, credential stored false, external transport false and the
missing provider authorization/configuration. Revocation disables local access
without deleting history.

## Trusted normalized inbound email

Requires event ID, workspace/account IDs, opaque message/thread/cursor/sender/
recipient references, received time, subject, normalized plain-text body,
optional exact project/contact context and selected evidence IDs. A trusted
local adapter assertion must say authenticity verified and external transport
false. HTML, OAuth, raw provider URL and remote attachment locator fields are
unknown-field failures.

## Inbound result

Returns event/canonical-message/project/contact IDs, resolution state,
clarification/refusal reason, replay flag, evidence-link count, canonical effect
ID if any, cursor status and external transport false.

## Prepared outbound draft

Requires exact contact/project, To/Cc opaque references, subject/body, optional
thread reference and selected evidence IDs. The result exposes version and
payload hash for inspection. Exact approval requires both; stale or altered
approval fails. The only terminal local status is `APPROVED_UNSENT`.

## Cockpit projection

Owner/admin sees account status, project email event timeline, proof and exact
draft inspection. Field projection contains only assigned minimized status and
recursively forbids body, subject, recipients, financial terms, thread/message
references and evidence details.
