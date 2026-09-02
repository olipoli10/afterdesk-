# R24 research decisions

Research checked 2026-09-01. These decisions are product guardrails, not a
claim of legal sufficiency.

## Commercial electronic message guardrails

The CRTC states that commercial SMS messages are subject to CASL and describes
consent, sender identification and a working unsubscribe mechanism. It also
notes that SMS can use a reply such as STOP for unsubscribe.

- https://www.crtc.gc.ca/eng/com500/faq500.htm
- https://crtc.gc.ca/eng/com500/guide.htm

**Decision**: retain consent evidence by purpose, make STOP immediate and
durable, and do not treat START as sufficient evidence for every purpose.
External compliance review remains required before provider activation.

## Provider-neutral lifecycle

Twilio's official documentation describes inbound webhooks, asynchronous
outbound status callbacks and opt-out handling at messaging-service/sender
levels. It also recommends POST for message webhooks where possible and warns
that query strings may be logged.

- https://www.twilio.com/docs/usage/webhooks/messaging-webhooks
- https://www.twilio.com/docs/messaging/services
- https://www.twilio.com/docs/messaging/guides/track-outbound-message-status
- https://www.twilio.com/docs/messaging/guides/privacy-message-redaction
- https://www.twilio.com/docs/messaging/features/consent-api
- https://www.twilio.com/en-us/legal/messaging-policy

**Decision**: keep canonical suppression inside ENDVERA instead of depending on
one provider block list. Model lifecycle callbacks as immutable adapter events,
but expose no executor in R24. Persist no raw webhook body, remote media URL or
credential.

## MMS evidence

Remote provider attachments can contain untrusted bytes and expiring URLs.

**Decision**: R24 accepts only identifiers and hashes for media already admitted
through ENDVERA's selected-file security pipeline. Future adapters must stage
provider media outside the canonical transaction and submit it through the same
inspection contract before it can be linked.

