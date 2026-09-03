# Quickstart: R37C Local Validation

Use a fresh disposable PostgreSQL database. Apply the full forward migration
chain, then run the R37C unit and integration suites. Verify successful
reserve/run/store/settle, known-failure release, concurrent duplicate collapse,
completed replay, expired synthetic lease reclaim, kill switch and restart.

Expected evidence is `CODE + TEST + SYNTHETIC`; provider calls and real spend are zero.
