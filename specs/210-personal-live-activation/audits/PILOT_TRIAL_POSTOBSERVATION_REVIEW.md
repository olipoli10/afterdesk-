# Trial T after79 — read-only post-observation review

2026-09-11 UTC /2026-09-10 Toronto. **Recorded controller evidence reviewed;
no new database/provider observation by this reviewer.** No SQL, network,
credential, Prisma process, application action or capture-producing script was
executed. Only local metadata artifacts and source were read. Engineering
code-review guidance used; distinct agent is not independent model certification.

## Evidence inspected

Read the actual owned-stage receipt at
`C:/dev/endvera-personal-trial-preflight-20260910/.scratch/pilot-trial-prisma-32d9f8db-9277-4e61-9432-22ef0c9748ce/receipt.json`,
both content-free evidence files below, private after79 aggregate/catalog/added
captures, full190-entry delta and `inspect-trial-after79-guards.mjs`. Existing
four-capture analyzer and strict catalog normalization had already been reviewed.

- `evidence/pilot-trial-migration-20260911T0017Z.json`, SHA
  `2fcd8065fc34c5b290def421bc0ac4c3ee4fff760406b681a63b69f8258c618b`.
- `evidence/pilot-trial-postobservation-20260911T0021Z.json`, SHA
  `857d89e7f2ee609e30214ad0de16b64f0d692df1fba8a2ea24e68cd92d39ceb4`.
- After aggregate `.scratch/pilot-trial-data-after79-20260911T0018Z.json`, SHA
  `82efe5155bd3247744d8c022aa19f715379b3fd7dbefb929d5d392c000d743ac`.
  This is exactly the freshly reread prewrite70 capture's byte hash. Original
  baseline3137a7b4 remains retained; its semantic comparison was performed and
  recorded by the controller, not rerun here.
- After catalog SHA
  `821e8267b9b400ca38521526d03441687b7e91dd1865b160f811bac1387e6861`;
  added-state SHA `98e3d18b55190792fde346a688f4735dfe29725ebd1006d9edcb9745267c175a`;
  original full delta SHA
  `62e416ff8d81bb7b72f9a3aa2a5db0793e30c02581b5ac7d0152cc5fec26d7e2`.

All three after captures and the delta are under `.scratch/` with suffix
`after79-20260911T0018Z.json`; the schema delta uses `schema-delta-after79`.
These local hashes bind reviewed artifacts, not remote provenance by themselves.

## Coherence and implications

1. The retained actual receipt records source
   `9f8c8d7ce9f7e1d90f625b72db3b50b3ffb49287`, exact trial T, childExit0,
   60124ms, PG180006 before and after, history70 then79, and identical
   first70 fingerprint47e1af33. The CLI policy remains strict-TLS source-bound;
   backend SSLfalse is retained and is not evidence that client TLS was absent.
2. The aggregate contains183 tables,81 old-projection rows in9 nonempty tables,
   no truncation, and complete filtered history70. Controller records2624 old
   columns and zero changed counts/digests. The nine added migration records are
   verified separately by history79, not silently included in the old81 rows.
3. Seven proof tables contain zero rows. AiOperation,
   PersonalAssistantOperation and VoiceIntakeSession each contain zero rows:
   their new-column checks are **vacuous**, not observed behavior on populated
   application records. This limitation is correctly explicit in the receipt.
4. The delta retains583 expected and583 actual changed objects and190 raw
   discrepancies. All189 ACL discrepancies are owner-only qualifications for
   synthetic_local_operator versus neondb_owner, not an ignored ACL hash delta.
   The remaining identity is precisely
   `PersonalSmsTemporalClarification.PersonalSmsTemporalClarification_check1`.
   The controller's PG18 read-only Toronto deparse reproduces native
   `db42828858820f7026bceb6eae5fbec5a6421cfe7b8943b7c65cca1c6efd50a2`;
   the retained UTC capture is
   `d08f9aaad09b999ce884aaf214f08748e5e7449b14c07317eecd5f990968f925`.
   Same-instant true, validated true and enforced true are explicitly recorded.
   This justifies a qualification of this exact definition, **not** general
   whitespace/timezone normalization or replacing the original190-difference result.
5. The receipt records all18 UTC defaults matched, zero known guard reviews and
   zero unsupported objects. Source helper checks named default hashes; the full
   delta separately covers the other definitions/fields. The retained actual and
   native function metadata both contain migration77 body SHA
   `34a6ce271c170a0da403ba97d016d3681f3d3897e2415f6038f30adc8c6ccae1`.
   No function body or application row was printed by this review.
6. Controller records T idle and suspendedAt2026-09-11T00:21:13Z. This is retained
   provider observation reported by the controller, not a fresh suspension
   observation performed by this reviewer.

## Decision and remaining limits

**No blocking inconsistency found in the recorded bounded trial-copy outcome.**
Evidence supports the controller's qualification: one T70→79 migration,
preserved captured old-column aggregates and reviewed added-state/catalog
postconditions, followed by observed suspension. Do not reinterpret the generic
runner receipt's false preservation literals as failure: its scope is history;
the later controller evidence supplies the separate aggregate/catalog findings.

This does not upgrade original pilot/main, establish tested restoration of A,
full database equivalence, application workflows on PG18, provider/customer E2E,
deployment or APK readiness. Table/column catalog coverage is explicitly the
supported public scope; unchanged cloud-specific objects are preserved relative
to the real baseline, not forced to equal the synthetic PG17 environment.
Retain A/T, attempt marker, staged inputs, refused/intermediate captures and
unmodified raw discrepancies. Any later write or original-pilot upgrade requires
its own controller decision; this audit neither authorizes it nor alters rubric
percentages. No additional platform or test expansion is needed to describe this
specific observed milestone honestly.
