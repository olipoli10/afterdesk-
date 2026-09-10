# Pilot function body hash reconciliation — supplied 70-migration captures

Date: 2026-09-10. Scope: local files only, no PostgreSQL connection/execution, provider, credentials, or migration mutation. Worktree: `C:/dev/endvera-astra-r03`; HEAD read during audit: `18c514c8a22a1d4ff776cfc668a44b3731eab70a`. Working-tree evidence is pinned below, not certified by HEAD alone.

## Verdict

**26/26 differing application function body hashes are exactly explained by the historical accepted CRLF-to-LF migration source representation.** For each, the untouched local dollar-quoted body hashes to the native baseline-70 capture, and the same body after only `\r\n → \n` hashes to the supplied remote capture. No whitespace trimming, SQL formatting, Unicode normalization, replacement of literals, or other transformation was applied.

Additional cross-check: **64/64 common application function bodies** match the final local migration definitions and their history-selected representation on the remote side; 38 already match without a body-hash difference. The remote extra function is outside this common set.

This is a **body-source reconciliation**, not a complete schema equivalence verdict. The 26 `definitionHash` differences remain in the unmodified comparator. Their full `pg_get_functiondef` output has not been independently reconstructed for PG17/PG18 here; attributing the complete definition-hash delta solely to line endings remains an inference, not this audit's hash proof.

## Pinned inputs

| Local input | SHA-256 of exact file bytes |
|---|---|
| `.scratch/personal-pg-native-15b8389313f549c8b912fde2f657acb9/migration-rehearsal/catalog-70.json` | `c65354c20ba3a8b0e32f3887c835fa7e8b2219b79c871da9ac95b87487de01a3` |
| `.scratch/pilot-schema-remote-20260910T2204Z.json` | `05425e32b60aa07113376652535395241ca43733dc775a13b1d00d72804229f4` |
| `specs/210-personal-live-activation/evidence/pilot-migration-metadata-20260910T2106Z.json` | `010bf6c0eb2fc3e7d558764c54d7005a0d39de899918cf10d08c09aa40827d09` |

Current pure local migration catalog fingerprint: `a9ebecf12c010c42090b01c64c5683e275fcf779c432467a56eb06ad5e2a1f93`.
The retained native catalog receipt identifies query SHA `4a22d4adf2d74a48a4bc6d4d42bce6558ac2cef2f59ca44b9c64c7e6cd6be338`, 64 functions, 7,470 total catalog objects. It is a supplied local capture receipt, not authentication of the remote capture.

## Exact method and falsifiable checks

1. Reuse `buildPilotMigrationCatalog` from `deployment/pilot-migration-catalog.mjs` in read-only mode. Its regular-file/order/UTF-8/BOM/NUL/mixed-ending checks guard the local 79-file catalog; select only the first 70.
2. Join each of these 70 migration names to the retained historical metadata receipt. Require finished/non-rolled-back entries. Compare the recorded checksum first with exact bytes, then with the catalog's LF/CRLF alternatives. Result: **47 EXACT, 23 CRLF_TO_LF, 0 LF_TO_CRLF**, 0 unknown checksums.
3. Re-hash each complete history-selected migration text, not just its functions, and require equality with its recorded migration checksum. Thus the recipe is chosen by independent whole-file history evidence rather than selected to make a function hash pass.
4. Visit migrations in canonical order; inspect direct `CREATE [OR REPLACE] FUNCTION` declarations and extract bytes strictly between their matching `AS $tag$` delimiters. Preserve leading/trailing whitespace inside the delimiter. Keep the final named declaration. Found 69 declarations and 64 final names. This is a narrow inspection of these concrete SQL files, **not a general SQL parser** or general DDL replay engine.
5. Compare common functions by the snapshot identity tuple (schema, exact case-sensitive function name, input-type signature). In these concrete files, names are unambiguous; the only argument-bearing function in the differing set is `ConstructionProjectBrainCanonicalJson(jsonb)`, signature `[["pg_catalog", "jsonb"]]`; the other 25 signatures are `[]`.
6. Verify extracted unmodified bodies against the actual native capture: **64/64 exact**. This independently checks the narrow extraction and final-definition selection against what PostgreSQL stored. A historical DROP of `endvera_guard_construction_follow_up` in M2 precedes its replacement; the final selection is verified by that exact native body hash.
7. Apply only the already-selected whole-migration line-ending recipe to each body. Compare to the supplied remote hash: **64/64 exact**, including **26/26 changed**. For every changed body, byte-length decrease equals the number of CRLF pairs.
8. For each of the 26 shared entries, compare every snapshot function property: the only differing keys are `bodyHash` and `definitionHash`. No input snapshot, comparator, or SQL source was altered.
9. Repeat the in-memory analysis fresh: same 26/26 results. The Node commands print names/paths/hashes/counts only, never source bodies. Only this Markdown audit is written.

## Whole-file historical source evidence

All eight source migrations below use CRLF_TO_LF, and the transformed **entire file** hashes to the recorded historical checksum.

| Alias | Final source migration | Untouched local SHA-256 | Historical checksum = SHA-256(LF bytes) |
|---|---|---|---|
| M1 | `20260901233000_construction_operating_assistant_r19_job_scheduling` | `49e5987c037c5ac3a704e075d2707f0f723b9c085ab9016f2467dd95a79fdd4f` | `ca072ee98ffa83c9995d63f1699888744aa9dbc366a4e4f6db2e9a648cacc1d9` |
| M2 | `20260902001000_construction_operating_assistant_r20_follow_up_engine` | `14c52607d2b7be44228c0216a3a613e07ea4ecb5e61bad958442d38fe949b3c9` | `f5c02eb2f8f7f17ad4f1513ae167f8c6a864c37b8f24df366c94b44ea97b1638` |
| M3 | `20260902002000_construction_operating_assistant_r21_receivables_invoice` | `54c0decd3bb9897f661e2183b6ed52ff2a7357736a2f88310e927e5aba807787` | `e1e78bfdca5f67ab175dbcadeaf1482526cfb48bf844b2f37c05130025e48b98` |
| M4 | `20260902030400_construction_operating_assistant_r25_voice_calls` | `84f6b995a5a006b8a9f9a1f6085ae762acc9037837caeddc81dba03cbf726f12` | `070d655cefc68d04dcd05ae08528a9125a500678a4df8d9350afe269e3372fe1` |
| M5 | `20260903180000_construction_assistant_r36v_project_brain_intake` | `aef8b168e6ef8c62e92880f6cb031f3929e5a13e425650f1de5e22abf382a7f1` | `e813a331596d365aa958a2d40141ca61d2fcbe4d602de96771d14613a430dba0` |
| M6 | `20260903220000_construction_assistant_r36w_project_brain_fact_candidates` | `0e3d3c90a843439b9853ba409de18bfbb3d8713b536b9248800175b7df21b97f` | `1dc6f2261f3fa3e5a352cfb0db917edc75c82763f64356444246121a31045653` |
| M7 | `20260904010000_construction_assistant_r36x_project_brain_understanding` | `78d0482f910a4b309374399c2e4ddc717a66c7f0339c4b0522b3ee552635daed` | `058d01fe505ff5a60629017c2c4246192301049f3aa495aa4912e73d3844e936` |
| M8 | `20260904040000_construction_assistant_r36y_project_brain_assistant_memory` | `d3567dbff4e44781036e8c87b942a7c183bb0a1f5ad7cca0f607f2823693b495` | `7c25ae88404b60ef3476201e7e2a681fa6f25a88caa5bfc3897c78ae6418f6fc` |

## Exact body evidence — all 26

All names below belong to `public`. Source is `prisma/migrations/<migration>/migration.sql:<line>`. Every left hash equals the native bodyHash; every right hash equals the remote bodyHash. Source bytes and remote hashes remain distinct; this table is not a replacement normalized input.

| Function | Source | SHA-256(raw local body) | SHA-256(history-selected LF body) = remote bodyHash |
|---|---|---|---|
| `ConstructionCallTransition_immutable_guard` | M4:194 | `277ce60da3bf515736e6c5e599769f36bd6e4de1dba8b8a4d6efbae05fd400d5` | `bc9f69ce31f95183c3dc90a7ba083c8e439506a347dd074ef3e3e7cece90adeb` |
| `ConstructionProjectBrainAssistantMemory_binding_guard` | M8:85 | `c10438a1485a094000a9ca46d7aa1888ce25a785f0c904e57d2244c1d4911ab9` | `30e29c32091052eb0d9600f4ec55fde5655067764a867698720eb669cdc72ee1` |
| `ConstructionProjectBrainCanonicalJson` | M5:704 | `39389858aedea8029d0e167af60ab594df577d9cca3c6619054650194533a6ee` | `9e624003537e5d59614d5a2bffb570e5659ba3bd804e181478ac282d760bedda` |
| `ConstructionProjectBrainDecision_atomic_projection_guard` | M5:514 | `1093ca964d47c22b85cc855b7fba77ad2fc1dfd9febb2eb3e73777445946f065` | `0d71433c792bc36f4910b2991d3426fc3b07c7328b1542e31b66ff430db230e4` |
| `ConstructionProjectBrainFactCandidate_batch_guard` | M6:145 | `e028c027888e58e14996c38ff5ebe2ca5b144c0bc764bd14fc2dfec1dfbbe407` | `4915e5f32a17151f842a3ffb1a52aa260d746e35a8f2d3c166f32616803ef929` |
| `ConstructionProjectBrainFactCandidate_candidate_guard` | M6:188 | `c6a77162478ffa2573aa5005dae62408fb3f8dafc41b856ab2b8419fe3c92de1` | `8466e053e7293971b130abe408270a90e7b2a60b39b71d8c1fb84d84dd8b9963` |
| `ConstructionProjectBrainFactCandidate_decision_guard` | M6:242 | `3271cea056440b502a5d7fd59ac249bb06a38d7f5867c09ea65e359369dfe1cb` | `51cda22b207223472d1a02d748d8bab923bbc095c62624189e4d3c15097344e8` |
| `ConstructionProjectBrainFile_guard` | M5:212 | `69c54f4f1a93be0d676f3eee585d89dbc04a10f7e98eb15dd059c62f43a344d6` | `def9170e5ccb4c71818c89907153d10e4956725bc9dfe63e27d95ea5b22fe5b9` |
| `ConstructionProjectBrainHistory_immutable_guard` | M5:868 | `7f8c752d21434fcc81f109fa2b336015e6b0210f504192a49ce72713fe33cf63` | `b34339ff65489e6c1e1cc51d53c952f3de86d9871a01998e1b9caf4366f64764` |
| `ConstructionProjectBrainIntake_atomic_evidence_guard` | M5:314 | `a1f13fb1ce4fbca8d1aa043f6e25bb13ec28ebd3beb5abb04e62a478b8e81630` | `440c2fe5c1be87091b848948b24f0c3bf7142e6c11fd19995e50557492ddd5a4` |
| `ConstructionProjectBrainIntake_guard` | M5:245 | `025e3395815e1b7b31746e22846a09b8c69f09133a79b8a31484c682298640b9` | `daadf432c20200f5b1017ca3712a5d56f04215002076e3874057c1783ff0aa12` |
| `ConstructionProjectBrainMemoryCitation_guard` | M8:130 | `06eb72ad3b8affc7a0b98a03a44be16d6cbcb43aeedf9d5f8803c3256c324bd1` | `4f588c67c75858bcd0fff369b7c8b4390c78726d32adaf6bcbd3869bda0e5f84` |
| `ConstructionProjectBrainSnapshot_atomic_projection_guard` | M5:732 | `928b47fd98e841e444f11b121c3dcd075d2bf72d8e798b8d74e2621225e74239` | `b2544a269dfce27b86db70bfdb0b4e62f87a09d2cd78d68b2df0d7790b424cb3` |
| `ConstructionProjectBrainSource_atomic_projection_guard` | M5:616 | `6265a6cfe52659d5c3c18feeec2e8793d76cbfe7ba0867b9a1dc2702efcd484d` | `1624b8d7b3db58c7e0a7eb693532a90329337c8e14a4e8bae3bc843c7daacfb9` |
| `ConstructionProjectBrainUnderstanding_contradiction_guard` | M7:151 | `be14ef46943420a34f84aeb2171d9aebe9f209f9e43430215c18f1b931cf4488` | `8a6faabd7dd181969745eba9aea1a4c51328ea664c606c5e5030c1d8a50faf66` |
| `ConstructionProjectBrainUnderstanding_member_guard` | M7:139 | `7e669e25cf4da0fccdecc762f5d94c80b9a26ee0a60c55168f167a62ff00e12e` | `40e409d5011ca989584d3c35ca6516be9c3b44e9c58f57312ee066e979974cd4` |
| `ConstructionProjectBrainUnderstanding_resolution_guard` | M7:161 | `4b8c8ce19cc34d34c9da19ced23f83d6f2d82adf072cf9685c4c557f851fee48` | `0f01d0d3aa2692e64cdd9552126b9ffe492d26cac480d778e2cd70da4e046557` |
| `ConstructionProjectBrainUnderstanding_review_update_guard` | M7:172 | `c2df5b542cf0320171ff152ba8bb81e1145ba5b1b3b631a4d6d6ed5509693108` | `fe564a02b5939b6cb02107e59ad3344b5892994c53f7831cdc5adaf352c2da97` |
| `endvera_guard_construction_economic_command` | M3:183 | `e1d5ae622e639bfa603ff36b1be0ad2fcbccfaa7b77edccf6f40c4f81701e6a9` | `bae6104b8d33e6bfc82d0dd2cb8c4d3b2d742f5f79e8eafc2391e2091ecf25a8` |
| `endvera_guard_construction_follow_up` | M2:173 | `fb45afb835ae5f1cac6dd6fba00223ae93c916ff2b7fe8094945646a2a1eb510` | `84e641db5b7ce1db4116433e6523fcdf22903254d040983beda5be58d0ab266c` |
| `endvera_guard_construction_follow_up_attempt` | M2:205 | `2a45dce328a64a576f738ab973f027e15bfc8d773143c4e3933d6e2189791641` | `107cb1b332a363a02b2ead04c236489bfb706cc56540f5fd25db9e3b9ee46b69` |
| `endvera_guard_construction_follow_up_transition` | M2:227 | `66fafd2dfb0a7339405fca5d42defc91aed02c2b45b161435fffbc926d15bf61` | `731503658ffbeb86eb4f8e7cb50c5fb9cd3af3f7008a08f4372faaffeaf7f96c` |
| `endvera_guard_construction_job` | M1:119 | `43400665ec5b5daa2492f37839a9daf80ff5fc65029b8724bf68996fc0d8409a` | `92aefab4b7df340707955399bb72eac140afaa710a6f663e746b367d80b647c7` |
| `endvera_guard_construction_payment_promise` | M3:155 | `d21a43f4f491b772f7981b59ca7ba004ed768335faef490c5ab6b34b330b64e0` | `2cae91057f76918fbd05b9d90b083598c0d3e654237a1adaeb35937524a8d84e` |
| `endvera_guard_construction_receivable_r21` | M3:142 | `34c0a25a2796d72464ad66df7f8ff782ec3d9307fc2a6530e593eaf62c4aaa31` | `8ccfc107cbb7d42254adf2f2f8c0e38f7a76de25e56425be60bd15e0fea8f3a5` |
| `endvera_refuse_job_history_mutation` | M1:140 | `5b25744f66a2c2d902c03c0fd12ea4ea7c29bf868e146ca9020a5a422d6f2f1d` | `fcc76f213a2b50dd73acb7ded09174fab8ff1e8fba34d18f6ddcd0501220afb6` |

## Unadjudicated / no authorization change

- The remote extra `show_db_tree` function and its ACL remain unadjudicated.
- The two extra `cloud_admin` default ACL objects remain unadjudicated.
- Full deparsed function-definition equality, PG17/PG18 environmental differences, owners/ACLs, collations/extensions, backup/restore, and all other comparator findings are not cleared by this body check.
- A pure re-hash of supplied files does not independently authenticate remote capture provenance or prove runtime behavior.
- **No change** to comparator status, hash inputs, source/applied migrations, flags, deployment/build, or readiness. `executionAuthorized:false`; no DB/provider calls. Overall drift decision remains with the controller.
