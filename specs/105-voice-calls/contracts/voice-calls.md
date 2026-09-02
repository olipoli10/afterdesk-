# R25 Contract

## Trusted inbound call transcript

Requires schema version, event/call/workspace IDs, opaque caller identity,
occurred time, disclosure state, recording/transcription consent, normalized
transcript, transcript proof and a trusted R4 adapter assertion.

## Selected voice note

Requires an existing same-workspace/project evidence ID and content hash,
supported audio media type, duration <= 120 seconds and bounded bytes. Without
authorized transcription it yields `TRANSCRIPTION_PREPARED`, never transcript
text.

## Outbound call work

Requires exact contact, purpose, objective, disclosure version, result schema,
expected policy version and stable command ID. Result is `PREPARED_UNSENT` or a
bounded Human Work Unit; `externalTransportPerformed` is always false.

## Projection

Owner/admin projection may contain normalized transcript and call policy.
Field-worker projection is strict and recursively refuses raw phone, broad
transcript, commercial purpose, financial result, provider event/recording URL
and credential material.
