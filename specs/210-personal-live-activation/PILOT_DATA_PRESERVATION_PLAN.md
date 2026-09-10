# Isolated pilot data preservation — aggregate-only preparation

Continue checkpoint A/T under the existing dedicated personal backend mandate.
Initial checkpoint phase completed metadata reads only. This next local step
prepares a bounded read-only aggregate comparison for the isolated copies, not
an application-data export or permission to run migrations.

Need: record row counts and one aggregate cryptographic digest per existing
public table before/after rehearsal, preserving exact old columns across70->79.
Use the already captured and validated catalog70 as the closed table/column
allowlist; no arbitrary SQL/where clause, dynamic stored procedure invocation,
secret lookup, network or DB execution in the builder. Quote identifiers safely,
refuse duplicate/unsupported schema/type structures and bound table/column/SQL
counts. Reject tables without regular supported columns. Exclude no legacy
table silently. Query only explicitly listed old columns (including old Prisma
history) so added nullable/default columns do not invalidate the preservation
comparison. The eventual controller must separately verify new79 columns and
new proof-table emptiness. No hash normalization of row values.

Build a single READ ONLY REPEATABLE READ snapshot transaction with fixed timeouts
and statements returning table name, count and SHA256 of the ordered multiset
of SHA256 hashes of canonical old-column JSONB. Duplicate rows remain counted.
Never return individual row hashes, IDs, SMS/text/audio, password/credential
ciphertext, function bodies or settings. Count/digest output stays private until
controller projects a content-free receipt. Hashes prove comparison, not that
the database or rows are synthetic, authorized, recoverable, or fully equivalent.
Object coverage and unsupported PostgreSQL objects remain separate.

Pure comparator must reject malformed/duplicate/missing/extra table results and
capture mismatch; return limited counts/status, no execution authorization or
backupVerified promotion. A future native synthetic test will execute the exact
queries against the already owned local rehearsal before any managed PG18
aggregate reads. No actual remote data reads, A endpoint, new branch, credential
provisioning or migration in this implementation step.

Reviewer distinct from author checks canonicalization, quoted identifiers,
multiset behavior, nulls, source column binding, missing/extra table coverage and
limits. Controller chooses any later execution in a separate pinned procedure.
