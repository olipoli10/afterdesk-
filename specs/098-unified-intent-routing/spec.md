# R18 Specification — Unified Intent and Entity Resolution

## Product outcome

ENDVERA accepts the same operational fact from signed-in portal text, a local
voice transcript, or a selected-file observation and resolves it through one
provider-neutral contract. The source remains attributable, but source format
does not change the resulting intent or entity resolution.

## Required behavior

1. Every envelope carries stable envelope and source identifiers, workspace,
   occurrence time, source kind, verification state and optional project or
   contact context.
2. The authenticated user is the supplied-by identity. A client-controlled
   actor identifier is never accepted.
3. Resolution is deterministic and uses only canonical workspace projects,
   contacts and calendar state.
4. Ambiguous project, contact, date, time, amount or authority returns a
   clarification and performs no consequential write.
5. `RESOLVE_ONLY` never applies a canonical transition.
6. A voice transcript or file observation may transition only after an
   explicit `HUMAN_CONFIRMED` state. Portal text is already directly supplied
   by the authenticated user.
7. Validated transitions reuse the existing Construction Operating Assistant
   command processor. R18 must not create a parallel calendar, action or loop
   engine.
8. Envelope and source claims are replay-safe and fail closed when reused with
   different content or across workspaces.
9. Source provenance is durably recorded without storing a model conclusion as
   a canonical business fact.
10. External transport is always false in R18.

## Out of scope

- provider activation, live voice, SMS, email or calendar transport;
- model-generated canonical writes;
- customer data;
- schema, migration, dependency or lockfile changes;
- mobile UI redesign.

## Acceptance

- Equal facts across the three source kinds produce the same intent and entity
  identifiers.
- An ambiguous time produces a clarification and zero calendar/action/open-loop
  effects.
- An unverified transcript or file observation cannot transition.
- Exact replay produces at most one canonical effect.
- Changed-content and cross-workspace reuse of a stable identifier is refused.
- Unit, mobile and disposable-PostgreSQL tests pass with zero external
  transport.
