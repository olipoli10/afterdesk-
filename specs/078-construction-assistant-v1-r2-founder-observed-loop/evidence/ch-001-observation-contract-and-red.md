# CH-001 — Observation contract, fair control and RED

## Immutable subject

- V1 commit: `1dcd7c8874c7039bfc0bc9cf7cbfc5bd90ef0fa7`
- V1 tree: `c0c9dbcb800e469775b9c4339da914cbc16da1dd`
- package-lock blob: `f0663f30d007cb2664f7944749cfb0cc12849fd8`

## Contract

The control receives the exact same ordered messages, facts, language and reference time. It has no persistent database, audit, idempotency or approval mechanism. The observation schema requires `observer=Olivier`, a real start/end interval and a closed set of ratings. Unknown fields and fixture observers are refused.

## Logical RED observed

The targeted suite proves these invalid variants are rejected:

- `founder-observation-is-replaced-by-fixture`
- `stateless-control-receives-fewer-facts`
- `observation-input-order-drifts`
- `timer-starts-before-founder-action`
- `unknown-observation-field-is-accepted`
- `stateless-control-claims-persistent-memory`

## Acceptance

- manifest admission: `INVALID=0`, `VERDICT=ADMISSION_READY`
- contract/control tests: 7/7 passed
- `git diff --check`: passed

Result: **CH-001 DONE**.
