# R37E Provider Replay Brand Parity Closeout

Date: 2026-09-02
Evidence label: `CODE + TEST + DISPOSABLE_POSTGRESQL`

## Root cause and correction

The shipped work-engine prompts use Endvera, while the test-only synthetic
provider replay stage detector recognized only historical AfterDesk classifier
and planner phrases. It therefore refused the current classifier as `other`.
R37E recognizes both exact brand phrases and retains fail-closed unknown-stage
behavior.

## Validation

- Provider replay and synthetic responder regression: 2 files, 69/69 passed.
- Exact previously failing budget-demotion PostgreSQL integration: 6/6 passed.
- Fresh disposable schema path: all 61 migrations applied during reproduction.
- TypeScript typecheck: passed.
- Targeted ESLint: passed.
- Spec Kit Analyze: passed.
- `git diff --check`: passed.

## Additional diagnostic evidence

The complete PostgreSQL integration attempt exposed Prisma Dev server capacity
limits under the R31 500-effect load gate. R28 passed 6/6 in isolation; the R31
failure was `Can't reach database server`, not a product assertion. These
environment-capacity failures are not represented as passing product evidence.

## Boundary

No production source, provider, credential, network, customer data, external
transport, external write, spend, push, Preview, Production or deployment was
used. R37 observed provider execution remains separate and unauthorized.
