# Correction ledger — local campaign 206

This ledger links useful corrections to their recorded commands. It is not a canonical seal. Every command directory retains native stdout/stderr plus command metadata and hashes. Reviewer process exit 0 means a report was produced; the report's own status determines approval. All source-only reviews have `servedModel:null`. Astra authorship and Sol review are not a model-quality experiment or independent runtime proof.

## Original G2 findings

| Finding | Treatment | Evidence command IDs / boundary |
| --- | --- | --- |
| CANON-001 | Historical readiness reports retained as archived; new v3 current projection binds exact inputs. | `g3-readiness-review-before`, `g3-readiness-r3-after`, `g3-readiness-correction-review-r4` (APPROVE). |
| CANON-002, MOBILE-001 | New release definition and preflight use actual Expo slug `endvera`, mobile 0.1.1/code 3, without rewriting old signed evidence. | `g3-release-source-binding-tests`, `g3-release-r2-native-validator`; release hardening review tracked separately below. |
| CANON-003 | Brain current-entry supersession prepared; actual checkpoint must follow final G7 observations. | `BRAIN_RECONCILIATION_PACKET.md`; remains pending until the recorded Brain checkpoint, never claim the packet already changed Brain. |
| MOBILE-002 | Native and mobile-build validators recognize the actual founder-device profile and distinguish local preparation from signing/install/store readiness. | `g3-release-r2-mobile-validator`, `g3-release-r2-after-r2`. No Samsung session or signed binary produced. |
| ARCH-001 | Durable broadcast replay resolves the original operation after current workspace authorization but before mutable-contact lookup. | `g3-arch-before`, `g3-arch-after`; late runtime-authority reviews below remain distinct. |
| ARCH-002 | Local sealed executor owns its clock and bounds cooperative callback latency. | `g3-runtime-clock-before-r1`, `g3-runtime-clock-after-r2`. Cooperative cancellation is not operating-system preemption. |
| PRODUCT-001 | Archived static readiness flags no longer stand for a current product execution or whole-product readiness. | `g3-readiness-review-before`, `g3-readiness-r3-after`, `g3-readiness-correction-review-r4` (APPROVE). No financial/customer outcome claimed. |
| PRODUCT-002 | FR/EN examples explicitly illustrate the target assistant experience; current demo limitations remain visible. | `g3-product-copy-before`, `g3-product-copy-after-r2`, `g3-readiness-correction-review-r4`. This fixes misleading presentation, not the missing end-to-end interpretation capability. |
| PRODUCT-003 | Readiness/closure checks require the exact protected input set and actual root-bound reads. | `g3-readiness-review-before`, `g3-readiness-r2-before`, `g3-readiness-r3-after`, review R4. |
| PRODUCT-004 | Human handoff copy now distinguishes locally prepared context from actual assignment/delivery to a person. | Same product-copy and readiness R4 evidence. No human operator service activated. |

Original full IDs are prefixed `ASTRA-R0-`. Original findings and all eight native G2 outputs remain unchanged. An INCOMPLETE source-packet audit is not upgraded to an exhaustive audit by this ledger.

## Reproduced cross-file regressions and hardening

- **Guarded intent:** `g5-gi-before` / `g5-gi-after`, then `g5-guarded-intent-critical-review-r2` APPROVE. Strict bounded proposals behind the existing gateway return `PROPOSAL_INSPECTED_NOT_AUTHORIZED`, with no executable preview or active provider consumer. The authored 96-case corpus is not 96 model-generated successes.
- **Calendar DST:** `g3-dst-before` / `g3-dst-after`. Ambiguous or nonexistent Toronto local time asks for clarification instead of silently choosing an offset.
- **Provider graph:** `g3-next-entrypoints-before` / `g3-next-entrypoints-after-r2`, `g3-next-entrypoints-cli-r2`. Root/src Next entrypoints and related imports are statically inspected; this is not dynamic egress isolation.
- **Cross-platform fixture identity:** bounded CRLF-vs-Git-blob handling for sealed historical fixtures; historical evidence is not regenerated. Performance work bounds Vitest worker concurrency instead of stretching provider deadlines.
- **Build font dependency:** pinned installed Next font files remove the Google-font download from local compilation. Missing production authentication/storage configuration is not bypassed. Internal Next asset paths require revalidation on dependency upgrade.
- **Release input binding:** temporary fixture tests cover exact declared inputs, supported line endings, link/path refusal, metadata syntax and actual local route imports. Follow-up reviews found all-tracked-checkout and Git-index suppression gaps; final results must reference the subsequent native retests/review rather than treating earlier CHANGES_REQUIRED as APPROVE.
- **Gateway dispatch:** a prepared attempt must win an atomic claim before callback. A late refusal must also win its own claim before releasing a hold, closing an AI operation or writing audit state. `g3-gateway-refusal-before-r1` demonstrates the classification race; `g3-gateway-refusal-after-r1` has 12 passing synthetic transactional tests. Voice-path follow-up remains separately tracked until its retest/review exists.
- **R37 local authority:** current grant/candidate/lane/lease and internally owned time are rechecked across awaited boundaries. `g3-r37cf-authority-before` and `g3-r37f-lease-paired` retain before/after evidence. Subsequent Sol review required transaction rollback after delayed evidence writes and stable terminal replay commands; `g3-r37cf-review-findings-before` has 3 failing reproductions and `g3-r37cf-authority-postreview-tests` has 61 passing tests. Final separate review must still be read. No historical R37 verdict is changed.

## Known limits retained

Synthetic in-memory transaction mocks are not multi-process PostgreSQL race proof. Local PrismaDev/PGlite migration/readback evidence is separately labelled. No callback is treated as a secure OS sandbox. There is no active provider candidate, authenticated real-data intent integration, physical-device observation, phone number purchase, live voice/SMS, OAuth, deployment or new founder session in this campaign.

Final G7 command IDs, tested commit, exact broad-suite results, outstanding findings, unsealed status and Brain checkpoint belong in the post-observation closeout. Original failures remain part of the record even if a later test passes.
