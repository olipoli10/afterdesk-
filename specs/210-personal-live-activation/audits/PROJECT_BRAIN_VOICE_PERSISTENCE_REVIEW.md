# Project Brain voice persistence — independent review

Date: 2026-09-10. Scope: new OFF session creator, schema delta, migration `20260910120000_project_brain_voice_sessions_off`, existing voice ownership/frozen-field guards, and author unit/static/native fixtures.

Verdict: GREEN for parent-owned disposable PostgreSQL validation. No migration or database execution was performed by this reviewer. This is not a claim that the SQL migration has passed native execution.

## Findings closed before native validation

1. SQL checked transformer keys and synthetic mode but did not check the type or size of `id`, `version`, and `encodingProfile`. A malformed raw-insert manifest with a recomputed hash could therefore disagree with the strict TypeScript contract. The author added mandatory strings and 1–160 UTF-16-unit bounds, including supplementary Unicode characters. The reviewer reread the SQL and native test: 15 malformed raw-insert variants must fail with the specific transformer error, not merely a duplicate-key error. The old SQL acceptance was identified statically, not observed against a database by this reviewer.
2. The original partial unique source index and Prisma's ordinary `@unique` were semantically equivalent under the exclusive subject CHECK, but did not describe the same schema object. The author aligned the migration to a simple unique index, retaining permanent source nonreuse and multiple legacy NULL sources.

## Verified by source inspection and local tests

- Existing legacy CLIENT identity and consent/limits remain frozen using `ROW IS DISTINCT FROM`; a null-client Project Brain session cannot acquire legacy owner or reserve authority.
- Source/session identity is compound-FK-bound to workspace/project/intake. Current owner/member/project/source rows are locked and the source fingerprint is reloaded before the atomic session and segment insertion.
- Local consent is explicit, current within 15 minutes by database clock, closed to external processing, and not inferred from upload. An exact replay reports existing state without refreshing consent, expiration, holds, or attempts.
- Immutable hashes and the current-row deferred manifest checks preserve exact coverage at commit. Session deletion/truncation cannot erase the permanent source restriction. Epoch snapshots do not block later owner revocation.
- Explicit UTC-naive timestamp conversion is retained for new raw writes, defaults, and JSON instant comparisons. Existing gateway/client operation vocabulary is not expanded.
- Independent tests cover malformed transformer values, maximum label bounds, synthetic-only flags, null-client access, retained legacy triggers, current-row manifest checks, SQL label guards, and unique-index alignment. They do not substitute for execution of PostgreSQL constraints.

## Limits

Follow-up: parent reported first native migration failure `42601` in `evidence/postgres-native-1789028796787`, before any test executed. The static review had not detected the unparenthesized `IF NOT CASE` expression. The reviewer subsequently checked the two-line correction to `IF NOT (CASE ... END) THEN`: MIME branches and refusal behavior are unchanged. Native rerun remains separate evidence; this note does not convert the failed attempt into a SQL pass.

The session stores synthetic manifest metadata, not decoder proof or usable retained audio segments. `mediaDecodingVerified:false`, `executionAuthorized:false`, no external transport, and no spend reservation remain accurate. Later production dispatch requires a separate current authority check, explicit provider consent, approved decoding/storage, privacy/routing, and budget admission; this review does not authorize or implement those steps. No provider, personal audio, native executable, or real user workflow was exercised.
