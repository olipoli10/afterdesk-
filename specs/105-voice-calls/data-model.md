# R25 Data Model

## ConstructionCallSession

- workspace/project/contact and opaque identity references;
- direction, purpose, lifecycle state and exact idempotency key;
- disclosure version/state;
- recording and transcription consent states;
- transcript proof level and transcript hash;
- next-owner reference and external-transport=false.

## ConstructionCallTransition

Immutable command/callback ledger with command fingerprint, state before/after,
actor/adapter provenance and timestamp.

## ConstructionVoiceNoteReference

Links a call session to an already admitted selected evidence object. Retains
content hash, media type, duration, byte size and transcription state. It never
stores a temporary device URI or provider recording URL.

## ConstructionCallWork

Exact prepared outbound objective, disclosure script version, allowed result
schema, policy decision and optional Human Work Unit link. Execution stays
disabled in R25.
