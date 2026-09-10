# Correct client transport versus backend SSL observation

Bounded correction within existing personal pilot; no migration authority.
Original actual Prisma preflight REFUSED/child0 remains immutable evidence.
The separately captured connector snapshot is not substituted for that result.

Peer design review confirmed PostgreSQL pg_stat_ssl observes the backend
connection, not necessarily the client-to-Neon-proxy TLS segment. Installed
Prisma6.19.3 generated client engine commit c2990dca591cba766e3b7ef5d9e8a84796e47ab7
maps sslmode=require to Require and sslaccept=strict to Strict, with invalid
certificate acceptance false. References:
https://www.postgresql.org/docs/18/monitoring-stats.html#MONITORING-PG-STAT-SSL-VIEW
https://neon.com/docs/security/security-overview
https://github.com/prisma/prisma-engines/blob/c2990dca591cba766e3b7ef5d9e8a84796e47ab7/quaint/src/connector/postgres/url.rs
https://github.com/prisma/prisma-engines/blob/c2990dca591cba766e3b7ef5d9e8a84796e47ab7/quaint/src/connector/postgres/native/mod.rs

1. Finish bounded fixed failure diagnostics; never include raw exceptions,
   credential, SQL output or application values in failures. Keep original run.
2. Pure inspectPilotTrialHistory requires boolean snapshot.tls; preserve it as
   backendConnectionSslObserved. False is a valid backend observation, not an
   encrypted-client claim; missing/null/strings still refuse. All database,
   role, READ ONLY, PG18, history/order/checksum checks stay unchanged.
3. Only actual runner after canonical target/strict TLS URL, closed child env,
   exact source/client/runtime binding, successful child and valid history may
   add fixed clientTransportPolicy PRISMA_REQUIRE_TLS_STRICT_CERT to its receipt.
   No caller-provided TLS proof or alternate connection URL. No negotiated
   certificate/cipher/hostname observation claim; policy is source-bound.
4. Update closed bridge receipt validator and tests for this exact shape. It
   rejects missing/unknown policy or malformed backend observation. All existing
   deadline, one-child, private ingress and terminal restoration gates remain.
5. Reproduce former false observation refusal locally; revised tests preserve
   false while rejecting invalid types and weakened client parameters. Peer
   reviews critical delta before commit and use. Do not build a second TLS proxy.
6. After clean source/pins and fresh exact T metadata, one corrected read-only
   invocation can execute under current mandate. Retain new real receipt; do not
   relabel prior refusal. No automatic retry after unknown outcome. Suspend T in
   all cases. New success proves only checked policy/identity/history, not data
   migration, application readiness, verified backup or network-wide TLS.

MIGRATE_70_TO_79 remains hard-disabled throughout this correction.
