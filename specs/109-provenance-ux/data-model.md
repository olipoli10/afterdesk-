# Data Model: R29 Plain-Language Provenance UX

R29 introduces projection types only. No database table changes.

## ProvenanceEntry

- `id`: stable `<kind>:<canonical-id>` identifier
- `kind`: `FACT | INFERENCE | DECISION | ACTION | HUMAN_RESULT | VERIFIED_STATE`
- `recordedAt`: canonical record time
- `statement`: closed-template plain-language explanation
- `stateLabel`: explicit truth/lifecycle label
- `canonicalRef`: entity type and entity ID
- `source`: safe source kind, label and optional stored predecessor ID
- `causalParent`: stored predecessor entry reference or null
- `details`: role-safe kind-specific structured details

## ProvenanceProject

- exact workspace/project identity
- requester projection role
- generated time
- summary counts by truth/lifecycle class
- deterministically ordered entries
- latest verified state per open loop
- `externalEffectCount=0` for the R29 projection operation

## Owner/office details

May include safe operational reason codes, state versions, financial fact values
where already authorized, source entity labels and immutable result/snapshot
fingerprints.

## Field details

Contains only work-relevant state labels, safe descriptions and next responsible
role. It excludes money, raw communications, fingerprints/hashes, policy
internals, evidence source references and human-work internals.
