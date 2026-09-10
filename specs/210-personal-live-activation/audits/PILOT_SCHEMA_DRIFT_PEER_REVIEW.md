# Pilot schema drift — separate peer review

Date: 2026-09-10. Status: preparation; author implementation not yet frozen.

Read the complete accepted `PILOT_SCHEMA_DRIFT_PLAN.md` at controller commit `3f51a70a8ae50b82f2d1a11a640ce4066cde39a4` and the code-review skill. Reviewer owns only this audit and `test/personal-pilot-schema-drift-review.test.ts`. No database, provider, migration, native rehearsal, harness or author source modification is authorized or performed here.

## Review contract

The fixed query must inspect non-extension public application metadata, not customer rows or secret values. Extension identities remain explicit. Qualified identities replace OIDs. Missing/duplicate/truncated or unsupported metadata must prevent an equivalence claim. PG17/18 NOT NULL and enforcement differences must be handled by precise version rules rather than accepting malformed missing fields. Owner, ACL, RLS, collation and extension-version differences cannot be silently normalized away.

The supplied-snapshot comparator must reject unknown keys, prototypes, accessors, unsafe arrays, duplicates and excessive counts/bytes/strings before comparison. Equality authenticates neither input. Results must retain `snapshotProvenanceVerified:false`, `executionAuthorized:false` and `backupVerified:false`, with full coverage false for unsupported or unadjudicated differences. This is a separate agent's review, not independent validation by a different model or a claim of model-quality independence.

Planned independent tests include valid modeled controls, changed constraint/FK semantics, invalid or missing indexes, disabled/changed triggers, function/security/config changes, ACL/RLS and enum ordering, unknown/unsupported objects, truncation/count mismatch, deep mutable object boundaries and pre-serialization limits. No test will be described as real remote schema evidence.

An early design note sent to the author: function `proconfig` can contain arbitrary GUC values, not just search_path. Preserve configuration differences by server-side hashing rather than returning raw configuration values that could include secrets. No defect is claimed before the implementation is available.

Executed tests, source hashes, concrete findings and a bounded verdict will follow the author's freeze.

## Reproductions and fixes, preserving the initial outcomes

The initial complete comparator/shape source was read. Independent synthetic fixtures cover all supported families with explicit owner/ACL links, without importing or registering the author's test suite.

1. **17:51:43 — 15 PASS / 5 FAIL.** Four identical pairs containing orphan TABLE/COLUMN/FUNCTION/TYPE ACL records were accepted after removing their corresponding objects and correcting objectCount. The fifth case proved descriptors for an array of25001 entries were materialized before the25000 bound refused it. The latter fixture is bounded and does not claim an OOM, exploit or adversarial OS isolation failure.
2. Author added reverse ACL-object consistency and array-length checking before descriptors. A closed eleven-family count manifest was also added following the SQL peer review. Reviewer fixtures were updated only to supply accurate manifest counts; orphan assertions were tightened to exact `ORPHAN_ACL`, preventing false GREEN from an unrelated family-count error.
3. **17:52:18 — 6 FAIL / 20 deliberately filtered skips.** Per controller arbitration, equal snapshots containing an unvalidated constraint, invalid/not-ready/not-live index, or D/R trigger must preserve mathematical equality but separately request guard review. Each initial result was `SUPPLIED_SUPPORTED_PUBLIC_CATALOG_MATCH`. Author added `knownGuardReviewCount` and `GUARD_REVIEW_REQUIRED` without claiming universal health, provenance or execution authority.
4. **17:54:37 — 41/41 PASS** after those changes. Added independent PG17/18 version-rule, manifest, environment-difference and aggregate/output boundary cases: **53/53 PASS at17:55:57**.
5. **17:56:57 — 1 FAIL / 53 deliberately filtered skips.** A precisely bounded fixture containing16 difference details of8192 bytes each produced a131786-byte response, exceeding the promised131072-byte complete-response ceiling. The initial limit charged only details, not envelope/separators. Total16 and incomplete-coverage status were verified before the failing size assertion. Author notified; final cap correction is pending at this append.

## What the independent cases establish

- Real object order does not alter comparison; semantic enum order does. FK deletion action, validation, index state, trigger mode, function security/body/config hash, ACL hash, RLS and policy-expression changes remain differences.
- Object/properties/server/root accessors, proxies, hidden or symbol fields, inherited prototypes, sparse/extended/derived arrays and unknown `__proto__`/constructor fields refuse without getter/trap invocation or prototype pollution.
- Duplicate object identities, declared truncation and count mismatches refuse. Strings are bounded and reject NUL/unpaired surrogates. A roughly4.8MiB modeled aggregate refuses before serializing the complete normalized snapshot; this is not an unbounded allocation stress test.
- Explicit PG17 missing catalog fields normalize only under the17 rule; malformed18 fields refuse. Equal18 unvalidated/unenforced NOT NULL or constraint facts require guard review. Platform version, ownership and extension changes remain explicit environment review, not ignored noise.
- Supplied equal unsupported objects yield incomplete coverage. Difference output exposes identities/changed field names, not previous/new property values. Neither modeled snapshots nor matching hashes attest a live catalog, backup or source provenance.

No SQL was executed. Query syntax and actual PG17/18 catalog behavior remain the controller/SQL peer's separate validation. Full public/database equivalence and all execution/backup/provenance flags remain false. This review is separately authored by a peer agent using the same model, not a different-model quality validation.

## Final frozen comparator verdict

The final output fix constructs the complete bounded result, then removes detail entries until the **entire JSON response** fits131072 bytes. It retains all difference counts, verdict, mathematical definition-equality flag and marks detail truncation. Reviewer read the correction and final validation/normalization/comparison blocks; the original size oracle remains unchanged.

Fresh author42 + reviewer54: **96/96 PASS at17:58:30**. Root TypeScript no-emit exit0 after the author's one callback annotation; scoped reviewer ESLint exit0. All54 reviewer tests are frozen.

- Final module SHA256: `566843fd685e259b3fe28d4231c9d5a62ce1474de18fd663712fe948556a8368`.
- Reviewer test SHA256: `7cf762d0b012cae64b5d6769e727b5e586e660ce83e89a94a81a586d634209a1`.

**GREEN for the reviewed bounded supplied-snapshot comparator, not for real schema equivalence or deployment.** No additional actionable comparator defect remains from this review. Matching metadata is not authenticated, not a full health assessment, not a complete database-equivalence claim and not evidence of an actual PG17/18 query run. The controller must separately observe real catalog output, SQL execution and relevant environment differences. Execution, backup and snapshot-provenance claims remain explicitly false.
