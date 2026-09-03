# R37H closeout — local trusted clock boundary

Result: `LOCAL_PROVIDER_TRUSTED_CLOCK_BOUNDARY_PASS`

## Implemented

- Five R37B public command schemas and the R37C public execution schema now reject caller-controlled `now`.
- R37B reads time through a server-owned `ProviderTrustedClock`; invalid values fail closed as `R37_TRUSTED_CLOCK_INVALID`.
- R37C reads one trusted instant per attempt and threads a fixed internal clock through reservation, lease, settlement and release.
- R37F can receive the same internal execution option without adding it to raw command data.
- Existing deterministic tests now inject time separately from parsed commands.

## Exact evidence

- RED before implementation: 1 file failed; 6/6 tests failed because caller time was accepted.
- R37A-R37H focused unit tests: 7 files; 28/28 tests passed.
- Disposable PostgreSQL R37B/R37C/R37F/R37G: 4 files; 16/16 tests passed; 62 migrations current.
- Root unit suite: 151 files passed, 2 skipped; 2,069 tests passed, 2 skipped.
- Typecheck: passed.
- Lint: zero errors; one pre-existing R34 `_canonicalHash` warning.
- `git diff --check`: passed.
- `package-lock.json`, alternate lockfiles and `prisma/schema.prisma`: unchanged in R37H.

## Boundaries

No provider, credential, network, external transport, external write, customer data, push, Preview, Production, deployment or store action was used. The disposable PostgreSQL database remains available only for the next authorized local release.

## Metrics

This security hardening does not alter canonical roadmap phase exits, local AI engine build readiness, C2 preparation, real provider/customer test readiness or Verified-E2E observed coverage. Real provider/customer testing remains `NO-GO`; Verified-E2E remains 0%.
