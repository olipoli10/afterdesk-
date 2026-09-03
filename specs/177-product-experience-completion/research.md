# Research: Product Experience Completion

## Decision 1 — Preserve the current site and add TextAssist

- **Decision**: Add one isolated banner to the current homepage and a dedicated `/textassist` surface.
- **Rationale**: The founder explicitly rejected deleting the current site. An additive route is reversible, measurable, and avoids coupling the existing managed-work offer to the construction assistant.
- **Alternatives considered**: Replacing `/` was rejected by founder direction; redirecting `/construction` was rejected because it would not create a distinct product entry.

## Decision 2 — Five primary mobile destinations

- **Decision**: Keep Today, Assistant, Projects, Calendar, and More visible. Hide all other Expo Router routes from the tab bar and link them from More.
- **Rationale**: These five match the contractor's daily mental model while preserving all existing capability screens and deep links.
- **Alternatives considered**: A drawer adds another navigation paradigm; retaining 24 visible tabs preserves the internal-console problem.

## Decision 3 — Static public deletion information first

- **Decision**: Provide a public route explaining deletion, sign-in path, support escalation, and what is not performed merely by visiting the page.
- **Rationale**: It satisfies local product clarity and prepares the public store-policy URL without pretending a production request has been submitted.
- **Alternatives considered**: An unauthenticated destructive form is unsafe without deployed identity verification and support ownership.

## Decision 4 — No new dependencies or persistence

- **Decision**: Use the installed Next.js and Expo Router patterns and existing state contracts.
- **Rationale**: The gap is experience composition, not missing infrastructure. Incremental reuse minimizes risk and preserves accumulated evidence.
- **Alternatives considered**: A new native shell or design system would reset evidence without increasing verified capability.

## Evidence labels

- Current page and navigation inventory: **CODE**, verified 2026-09-03.
- Tests and builds produced by this feature: **TEST** when run.
- Provider, customer, production, signed binary, and store outcomes: **UNKNOWN** until separately observed.

