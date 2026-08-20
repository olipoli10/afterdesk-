# Model Gateway v1 — Inherited Baseline

Recorded on pristine starting source at `4036d62fc5e56367df8e37cd5cee1d3c550d1cad`.

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` | exit 0; no errors or warnings |
| TypeScript | `npm run typecheck` | exit 0 |
| Fast suite | `npm run test:run` | 62 files passed; 1,485 tests passed; 0 failed |
| Disposable PostgreSQL integration | `npm run test:integration` with guarded local `afterdesk_integration` | 29 files passed; 345 tests passed; 0 failed; 35 inherited migrations; 179.25 s |

The integration run used `127.0.0.1:51214/afterdesk_integration` with `ALLOW_INTEGRATION_DB_RESET=1`. No application database URL was present. The guard announced the exact disposable identity before proceeding.
