# R24 contract summary

## Inbound event

Strict versioned envelope containing event ID, workspace, opaque sender identity,
time, `SMS_TEXT` or `MMS`, body and zero or more selected-evidence references.
Only a server-supplied trusted adapter assertion can admit it.

## Policy commands

Owner or office administrator can record purpose consent or withdraw it using a
stable command ID, expected policy version and opaque evidence reference.
Keyword opt-out is event-driven and does not require an owner command.

## Outbound preparation

The command binds workspace, action ID, exact action version, exact payload hash
and purpose. It returns recipient/contact projection, body, consent state,
fingerprint and `PREPARED_UNSENT`. `externalTransportPerformed` is always false.

## Delivery observation

Strict trusted event containing operation ID, opaque provider-event hash,
monotonic status and `SYNTHETIC_LOCAL` proof level in R24. It never executes a
send and cannot be described as real delivery.

## Cockpit

Owner/office: channels, consent/suppression, message timeline, media evidence,
prepared actions and delivery proof levels. Field worker: counts and safe
project routing only; no destination, body, consent evidence or finance.

