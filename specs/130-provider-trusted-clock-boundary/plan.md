# R37H implementation plan

1. Freeze public schemas with RED tests proving caller-controlled `now` is currently accepted.
2. Add a small shared trusted-clock contract whose default is the system clock and whose test override is not part of raw input.
3. Remove `now` from R37B/R37C schemas and thread one trusted time reading through R37B, R37C and R37F internal calls.
4. Migrate deterministic tests to internal clock injection and add invalid-clock fail-closed coverage.
5. Run focused unit tests, disposable PostgreSQL integrations, all R37 provider tests, typecheck, lint and diff validation.
6. Record exact evidence, commit locally and advance the autonomous queue.

No provider, network, external write, schema, migration, dependency, lockfile, route or deployment change is permitted.
