# R37B Provider Activation Controls — Local Closeout Evidence

Evidence label: `CODE + TEST + SYNTHETIC`  
Observed provider execution: `NO`  
External transport: `0`  
Real provider spend: `0`

## Delivered

- Strict workspace- and role-bound activation grants tied to one candidate,
  exact model, case allowlist and R37A sealed-executor fingerprint.
- Mandatory positive call and integer-microdollar ceilings; missing or zero
  configuration refuses.
- PostgreSQL-serialized reservation, settlement and release with immutable
  command decisions and exact replay.
- Durable grant revocation and a global kill switch checked in the same lock
  order as every new reservation.
- Additive forward-only migration with database checks for valid states,
  positive ceilings, nonnegative counters and aggregate ceiling integrity.
- No credential resolver, provider client, public route, automatic consumer or
  network path.

## Validation

- R36/R37 unit regression: 9 files, 73 tests passed.
- R37A/R37B focused unit validation: 2 files, 9 tests passed.
- R37B disposable PostgreSQL: 1 file, 4 scenarios passed.
- Fresh disposable PostgreSQL rebuild: all 60 migrations applied, then all 4
  R37B integration scenarios passed.
- TypeScript typecheck: passed.
- Targeted ESLint: passed.
- `git diff --check`: passed.
- Package and lockfile changes: none.

## Spec Kit Analyze

15 buildable FR/SC requirements map to the 10 implementation and validation
tasks. Coverage is 100%; critical issues, orphan requirements, unresolved
placeholders and constitution conflicts are zero. One non-blocking documentation
detail remains: the immutable decision ledger required by FR-004/FR-006 is
implemented as a fourth persistence entity although the short data-model
summary named only the three primary control entities.

## Readiness truth

This closes the local control prerequisite only. Provider quality, latency,
pricing, customer value and observed execution remain unknown. R37 still needs
fresh exact external authority, credentials and bounded provider observation.
No roadmap, real-test or Verified-E2E metric is increased by this synthetic work.
