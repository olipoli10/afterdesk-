# R37G closeout — provider security hardening

Date: 2026-09-03  
Evidence: `CODE + TEST + SYNTHETIC`

## Result

`LOCAL_PROVIDER_SECURITY_HARDENING_PASS`

The exact committed R37A-R37F diff scan completed with five confirmed findings: two medium and three low. R37G added five non-vacuous RED cases and closed all five without provider access, credentials, network transport, schema changes, dependencies or customer data.

Security scan ID: `50569b4d-d355-485e-b724-2d6dd9b07d8b`  
Report SHA-256: `91e59b9a6d9b2cbd551c476d8e9fdc112b3360182a8b0a2dba9993f7ef028c52`

## Closed findings

- Stale callbacks are fenced by exact run ID and lease token before canonical mutation.
- Foreign-workspace grants are rejected before controlled-run or audit creation.
- The exported R37A executor validates the sealed object and its fingerprints itself.
- Canonical evidence recovery recomputes its content digest.
- Failed and in-progress dispositions return `canonicalEvidence: null`.

The caller-controlled `now` field remains a deferred route-design issue. No untrusted route or provider authority may be added until a trusted server clock replaces it.

## Validation

- R37G RED before fix: 1/1 unit and 4/4 PostgreSQL security cases failed for their exact guard.
- R37A/R37C/R37F/R37G focused unit: 11/11 passed.
- All R37 unit contracts: 21/21 passed.
- R37C/R37F/R37G disposable PostgreSQL: 12/12 passed across 3 files.
- Root suite: 150 files passed, 2 skipped; 2,062 tests passed, 2 skipped.
- Typecheck passed.
- Lint passed with zero errors and one pre-existing R34 unused-variable warning.
- Next.js Webpack local build passed 111/111 routes using synthetic local build variables.
- `git diff --check` passed.
- Root and mobile lockfiles unchanged.
- Prisma schema and the 62-migration chain unchanged.
- External transport, provider calls, credentials and customer data: zero.

The first generic build command and first direct build attempt failed closed on missing environment guards. The synthetic-local direct retry passed without product changes and without Preview or Production.

## Constitution check

PASS. R37G enforces point-of-use tenant binding, durable lease fencing, tamper-evident evidence recovery, proportionate real-PostgreSQL tests, exact economic preservation and truthful synthetic labeling. No historical evidence is reinterpreted and no external authority is expanded.
