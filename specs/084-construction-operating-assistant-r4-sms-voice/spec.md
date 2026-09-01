# ENDVERA Construction Operating Assistant R4 — SMS and voice adapters

## Outcome

Connect provider-neutral SMS text and consented voice transcripts to the shared
Construction Operating Assistant command loop. Separate exact outbound
approval from transport preparation so a future provider can be added without
changing canonical business behavior. R4 performs no external transport.

## Required behavior

- SMS and voice use one strict, versioned inbound event contract.
- A trusted adapter assertion is supplied by server code, never accepted from
  the public event payload.
- Sender identity is an opaque workspace binding; a raw phone number is neither
  required nor admitted by the adapter contract.
- A voice event requires an explicit consent evidence reference and contains a
  finalized transcript only; R4 stores no audio.
- The same event, including concurrent retries, creates one canonical command
  effect and reconstructs the same result.
- Cross-workspace, unknown, revoked and unverified identities fail closed.
- Only an active owner or admin can prepare/revoke a channel, approve an
  outbound message or prepare an SMS dispatch.
- Exact approval binds action ID, version and payload hash without delivering.
- A prepared SMS dispatch exposes masked recipient, exact body and action
  version while remaining `PREPARED_UNSENT`.
- Connector operations store hashes and opaque references, not a raw recipient
  or duplicate message body.
- Every result and database operation records
  `externalTransportPerformed=false`.

## Explicit non-goals

Live phone numbers, Twilio or another provider, public webhooks, carrier
traffic, real calls, speech-to-text providers, audio retention, customer data,
OAuth, credentials, dependencies, destructive schema changes, push, Preview,
Production or deployment.
