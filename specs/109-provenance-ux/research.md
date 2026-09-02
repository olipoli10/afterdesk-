# Research and Decisions: R29 Plain-Language Provenance UX

## Existing evidence

- R0 stores facts, evidence, contradictions, transitions and immutable snapshots.
- R10 exposes exact prepared-action provenance but only for that action surface.
- R15 offers a chronological timeline with shallow entity provenance.
- R18 preserves source identity, verification and interpreter version for intent resolution.
- R22 binds human escalation acceptance and exact automated resume.
- R28 stores immutable policy evaluation and exact decision history.

## Gap

The data exists but a user still has to inspect multiple screens and understand
internal tables. A timeline label such as `CANONICAL_DATABASE` proves location,
not why ENDVERA believes a fact or how it reached the present state.

## Decisions

### D1 — Derive, do not duplicate

R29 adds no provenance event table. It reconstructs the explanation from existing
immutable records so the UX cannot drift from canonical state.

### D2 — Closed vocabulary and templates

Use six closed kinds and deterministic French templates. The model never writes
the explanation. Confidence is shown as a band, not false precision.

### D3 — Preserve uncertainty

Proposed, contradicted, verified and superseded are visually and structurally
distinct. Resolution adds history; it does not erase the original claim.

### D4 — Role-specific contracts

Field workers receive a separately parsed projection. Redaction after producing
an owner payload is insufficient because forbidden fields could remain nested.

### D5 — One project at a time

R29 is project-scoped. Workspace-wide trust search and export belong after R30
tenant/privacy lifecycle controls.

## Unknowns deferred

- Customer-preferred language for confidence and verification labels.
- Whether design partners need exportable provenance reports.
- Which provenance links create the most trust in observed use.

These require later founder/design-partner observation and do not block the
local deterministic implementation.
