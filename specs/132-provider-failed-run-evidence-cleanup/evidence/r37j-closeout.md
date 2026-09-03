# R37J closeout

- Source finding: `csf_3bf4140f108a33c61429caab` from scan `623c152b-681e-4440-8c84-696bc2d4dd35`.
- RED: 2 deterministic PostgreSQL failures reproduced retained canonical evidence after expiry-between-writes and terminal-clock failure.
- GREEN: exact-state and exact-token failed transitions clear generic and canonical evidence before exact spend release.
- Replacement lease evidence is preserved when a stale worker returns.
- Focused R37G security tests: 7 passed.
- R37A-R37H unit tests: 28 passed.
- R37B/R37C/R37F/R37G PostgreSQL tests: 20 passed.
- Full local suite: 2,069 passed, 2 skipped.
- Typecheck: passed.
- Lint: zero errors; one pre-existing R34 unused-variable warning.
- Package lock, Prisma schema and migrations: unchanged.
- Provider calls, credentials, network transport, customer data and external writes: zero.
- Implementation commit: `3ee6cfda22669610c70704f6afce45af9eb513c4`.
- Implementation tree: `f970d2ecfbdec2e0d9116522345de519c34cbae4`.
- Exact remediation scan: `e3c8a709-d921-4d9a-a4ab-5c1fa301a16a`.
- Remediation scan result: complete, zero findings.

Verdict: `R37J_LOCAL_COMPLETE`.
