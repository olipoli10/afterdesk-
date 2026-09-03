# Data Model

## WholeProductClosureAudit

- `status`: exact local closure status.
- `auditScope`: Web, iOS, Android, release package, store preparation and disabled backend.
- `protectedInputs`: relative path and SHA-256 pairs.
- `localScopeGaps`: material local gaps; must be empty to pass.
- `preservation`: existing-site and additive-surface facts.
- `platforms`: local platform evidence and honest binary limits.
- `backend`: activation and provider-boundary evidence.
- `externalBlockers`: exact blocker codes retained from the launch boundary.
- `remainingRoadmapReleases`: R37 through R40.
- external claim flags and `externalEffectCount`.

## Invariants

- Protected paths are repository-relative and unique.
- Any hash drift fails validation.
- Local closure does not imply provider, customer, signing, deployment, store or production evidence.
- `projectTerminalState` remains `INCOMPLETE`.
