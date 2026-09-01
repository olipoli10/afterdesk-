# R18 Plan — Unified Intent and Entity Resolution

## Objective

Route text, voice transcripts and selected-file observations through one strict
intent envelope that resolves workspace, project, contact and desired outcome
without inventing facts or bypassing existing canonical transition services.

## Allowed implementation

- normalize existing portal text, local voice transcript and evidence metadata
  into one provider-neutral envelope;
- reuse deterministic construction parsers and canonical write services;
- return clarification when project, contact, time, amount or authority is
  ambiguous;
- preserve source channel, source ID, supplied-by identity and confidence;
- add unit, mutation and disposable-PostgreSQL proof.

## Completion gate

- equal facts across allowed channels resolve to the same canonical intent;
- ambiguous input produces zero consequential write;
- no transcript or model output becomes canonical state without a validated
  transition;
- duplicate and cross-workspace envelopes fail closed;
- no provider, customer data, external transport or external write;
- no schema, migration, dependency or lockfile change unless a later bounded
  forward-only decision proves it unavoidable.
