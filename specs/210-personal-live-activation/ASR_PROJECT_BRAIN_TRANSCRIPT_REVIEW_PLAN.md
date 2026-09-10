# Project Brain — protected synthetic transcript review

Status: PROPOSED_FOR_CONTROLLER_REVIEW; design only, no implementation authorization inferred.
Date: 2026-09-10. Inspected checkout HEAD: `cb4f10a67233f27b019d990f09551abc3838c282`.
Decision owner: controller. Independent code/SQL review required before a later implementation checkpoint.

## Decision and exact scope

Reuse the existing voice gateway result ledger and protected `VoiceTranscriptSegment` rows. Add a narrowly scoped, OFF-by-default **owner-only read projection** before any fact-candidate writes. Assemble only complete, durably accepted synthetic results whose exact lineage and current access are revalidated. Do not call a model, decode audio, grant consent, reserve money, retry a segment, or change any source, session, snapshot or review during a read.

“Verified” means **stored text integrity, order and provenance verified**. It does not mean that speech was transcribed correctly. The current private runner emits `SYNTHETIC_LOCAL — no speech was transcribed...`; its output must remain visibly synthetic. The first slice makes this technical test result inspectable, not a usable transcription service.

The subsequent proposal slice must extend the existing R36W/R36X candidate/review mechanism with explicit transcript provenance. It must not disguise a transcript as owner-authored text, create a second gateway, or turn a synthetic demonstration into canonical project facts.

All proposed outputs retain `executionAuthorized:false`, `transcriptionQualityVerified:false`, `externalTransportPerformed:false`, `automaticConfirmationPerformed:false`. No external activation is included.

## Observed code, not new test evidence

The recovery predecessor passed 11/11 native tests at 2026-09-10T14:51:21.161Z, controller receipt `evidence/postgres-native-1789051849182`, exit 0 and exact cluster STOPPED. That receipt does **not** test this new projection or any transcription quality. This design turn performed source inspection only; it ran no tests, database, audio or provider.

| Existing seam | Observed behavior | Reuse / limit |
| --- | --- | --- |
| `voice/project-brain-sessions.ts` — `inspectProjectBrainVoiceSessionInTransaction` | Strict PB actor/workspace/project/intake/source/file hashes, manifest, consent, owner/member epochs, current source reinspection and DB expiry; caller-owned transaction | Reuse directly for current metadata authorization; do not weaken it to accommodate changed intake versions |
| `voice/project-brain-dispatch.ts` through canonical `dispatchVoiceGatewayAttempt` | Private synthetic runner; one attempt; protected transcript and exact terminal AI/gateway/attempt/segment links; settled zero-cost receipt | Read these accepted results, do not rerun dispatch to obtain text |
| `voice/transcripts.ts` | Existing loader authorizes `VoiceActor.role=CLIENT` against session `clientId`; PB sessions deliberately have NULL clientId | Keep legacy behavior closed; no fake CLIENT cast and no setting clientId on PB |
| `voice/assembly.ts` | All ordinals complete, per-segment text rehashed and bounded; total <=120,000 UTF-16 units; canonical ordered evidence | Reuse pure assembly after DB authorization; assembly alone is not an access check or a content-quality check |
| `voice/project-brain-sessions.ts` read projection | Always `transcriptionAvailable:false`; no protected text | Preserve that promise; add a distinct `syntheticReviewAvailable` result rather than relabel synthetic output as real transcription |
| R36V intake/source/snapshot | Source interpretation remains `NOT_REQUESTED_LOCAL_ONLY`; canonical snapshot records that limitation | Do not rewrite historical source interpretation or snapshots to make a review visible |
| R36W fact candidates | Only `OWNER_TEXT` / `EXACT_OWNER_TEXT` and `SOURCE_METADATA` / `EXACT_CANONICAL_METADATA`; confirmed intake/snapshot required | Future transcript proposal requires an explicit new version and provenance shape |
| R36X understanding review | Reconstructs the R36W candidate set; dispositions, contradictions, proposed snapshot and explicit exact-fingerprint confirmation | Reuse this review ledger; extending only the writer without extending this reconstruction would fail closed |
| Mobile R36W/R36X routes | Authenticated `getSessionUser`, verified email and application role CLIENT, strict query/body bounds, rate limits and private no-store responses | Reuse wrapper conventions, then require actual workspace owner in the protected reader; application CLIENT is not the legacy voice client subject |

Specific static gaps:

1. No PB-owner protected transcript read exists. The legacy loader rejects PB ownership and the PB metadata reader deliberately omits text. Reproduction to add: complete a real synthetic PB gateway segment, read current PB metadata (no text), attempt the legacy CLIENT read (refused), then exercise the new PB read with the same DB lineage.
2. `ConstructionProjectBrainFactCandidate` SQL provenance check and deferred canonical guard admit only the two existing forms. R36X `provenance()` treats the non-OWNER_TEXT branch as metadata. Adding an arbitrary transcript kind only to application creation is insufficient and risks false provenance if a later parser becomes permissive. No SQL bypass is claimed observed.
3. R36X currently chooses a latest batch by intake sequence and batch id, not a caller-pinned new transcript batch. A future second adapter version must select its exact batch/set hash explicitly; alphabetical UUID ordering is not a version policy.
4. A session created on DRAFT pins intake stateVersion/status/revision. Submitting or confirming the intake changes those pins. That is an intentional current-access refusal, not grounds to mutate its immutable binding. One session/source also prevents silently starting over to reset the budget.

## R1 — bounded protected read, no migration

Proposed new server module: `src/server/model-gateway/voice/project-brain-transcript-review.ts`.

Proposed entry:

`readProjectBrainVoiceTranscriptReview({actorUserId,workspaceId,sessionId,enabled?:boolean})`

The actor is supplied by the authenticated server caller, never from query/body. Copy and strictly parse IDs before the first await. OFF returns without DB access. Do not accept caller text, transcript IDs, segment arrays, result references, expected provider cost, or “already authorized” objects.

Transaction and proof sequence:

1. A bounded Serializable read transaction uses the same explicit statement/lock/transaction deadlines as the existing PB read wrapper. No automatic transaction retry that could hide changed authority. Use current DB time, not client time.
2. Reuse the existing session/source inspector and its shared locks. Require PB discriminant, original actor and source binding, live owner/member/workspace/project, unpurged source file, exact original intake version, unexpired session and exact manifest. No storage read or false file-download audit.
3. Load at most 14 result rows in canonical ordinal order. Join every transcript through its exact segment, session, gateway attempt, operation and AI operation. Check source and segment immutable hashes, AI subject kind/segment binding and `resultKind/resultId`, attempt `operationId`, final gateway attempt/evidence references, output contract, route's synthetic provider/model pins, and decision/request projection hashes. Reuse the existing canonical fingerprint/builders; do not introduce a second definition of accepted-result authority.
4. Require segment succeeded, AI succeeded, gateway succeeded with exact finalAttemptId, attempt settled with valid result contract, complete response evidence, and exact settled synthetic hold/zero-cost proof. No accepted-by-provider shortcut, unknown accounting, recovery terminal, cancelled result, orphan transcript, duplicate ordinal, extra transcript, result from another attempt, or AiUsage inconsistency. Evidence proves the existing local runner, not speech recognition.
5. Acquire shared locks for result/transcript/hold rows without lock upgrades. Preserve a documented order consistent with existing gateway terminal and purge paths. There is no provider/day budget lock or reservation in a read. Native overlap tests must validate no deadlock/retry assumption.
6. Rehash each protected text exactly, without trimming or Unicode normalization; verify text character count and audio fingerprint against its immutable manifest segment. Require transcript expiry finite and future, no purgedAt and no session closed/recovered state. For the first slice require the current successful session state `transcribing`, as the existing pure assembly supports; do not mark it ready merely to display.
7. Call `assembleVoiceTranscriptDraft` with the exact expected segment count and session status. Add a separate canonical fingerprint of the assembled text and a versioned review fingerprint binding context, source/session/manifest hashes, ordered transcript/attempt IDs and text hashes, assembly version, assembled text hash, synthetic label and earliest expiry. The existing assembly fingerprint binds evidence, not an arbitrary future join algorithm; pin both.
8. Check DB time again after the final awaited work, while the same current-access locks are held. Expiry during the transaction refuses. Return only after commit succeeds. A read proof is not a reusable authorization token; every future write must independently reload current state.

Output is immutable JSON containing schema version, exact context IDs, intake state version, source hash, manifest hash, ordered result provenance, exact assembled text and text hash, review fingerprint and expiresAt, with:

- `status:SYNTHETIC_REVIEW_AVAILABLE_NOT_AUTHORIZED`;
- `contentIntegrityVerified:true`, `semanticAccuracyVerified:false`, `transcriptionQualityVerified:false`;
- `syntheticReviewAvailable:true`, `realTranscriptionAvailable:false`, `projectFactConfirmed:false`;
- `processingMode:SYNTHETIC_LOCAL`, `mediaDecodingVerified:false`, `executionAuthorized:false`.

The expiry is the minimum of the existing protected content/session expiries; never extend it. Do not expose storage coordinates, audio bytes, credentials, internal prompts or other actors' metadata. No generic audit/error log contains text. Not-found/refusal responses disclose no protected text. Infrastructure rate-limit bookkeeping is separate from this no-domain-write read contract.

### Route and display, after server review

Add a dedicated GET under the existing mobile API family, proposed `project-brain-intake/voice-review`, accepting exactly workspaceId and sessionId once each. Session actor comes from `getSessionUser`; require verified application CLIENT plus current workspace owner. Admin/member access to ordinary Project Brain is not permission to read private PB voice text. Use no-store, bounded rate limit and no POST/fallback dispatch. Read the installed Next route documentation before implementation.

Mobile loads it only through an explicit “Voir le résultat de test vocal” gesture and only while its current actor/workspace/intake context still matches. Render plain text, no executable Markdown/HTML/link actions; clear on logout/context change and discard late responses. Do not persist the transcript in the voice journal, durable upload queue, analytics or general portal cache. Show “Texte synthétique de test — aucune parole n'a été transcrite” beside the actual text, not just in a footer. No “Accepter comme fait” button in R1.

## R2 — proposal seam, still non-authoritative

This is a follow-on design boundary, not permission to edit SQL now. It needs a separately reviewed forward migration and a versioned R36W/R36X change. Do not overload the V1 candidate schema, source metadata fields, ownerBrief, or historical snapshots.

Minimal strategy:

1. Use an explicit owner command with commandId, sessionId, expected review fingerprint and an exact confirmed intake snapshot/hash. Recompute R1 from DB in the command transaction. For the first durable candidate slice support **sessions originally admitted against the already-CONFIRMED intake version only**. A DRAFT-bound session can be viewed while unchanged but cannot cross to the later confirmed version by silently repinning. Historical-successor access/consent is a separate design item; its refusal must remain explicit.
2. Extend the existing candidate batch adapter version and candidate discriminant with `TRANSCRIPT_QUOTE` / `UNVERIFIED_TRANSCRIPT_TEXT`, retaining exact source/session/assembly/transcript evidence. Add a narrow evidence relation to the existing candidate, with composite owner/workspace/project/source bindings and immutable per-segment spans. Do not create a second candidate/review ledger. A quote is only an exact statement present in a transcript, not a verified fact or inferred date/person/action.
3. The minimal local builder is deterministic: explicitly selected nonempty UTF-16 spans from the reloaded transcript, with exact byte-independent text hashes, no caller replacement text and no surrogate-pair split. Cross-segment spans need ordered component ranges; do not fabricate word timestamps from segment duration. No semantic extractor or new model call in this slice.
4. Synthetic evidence remains demonstration-only. It may be rendered as an unconfirmed proposal for testing, but the R36X confirmation/assistant-memory boundary must reject synthetic candidates for canonical production facts. An explicit human review does not make the synthetic runner a transcription provider. Future real transcription needs its own authorized route/receipt and human review, not a flag toggle on the synthetic row.
5. Extend R36X strict provenance, expected-candidate reconstruction, candidate-set hash, exact batch selection, per-candidate dispositions and contradiction review. Retain compare-and-swap expected review version and command hash idempotency. The confirmation action must recompute exact proposal fingerprint and require explicit owner input; never invoke it from generation or GET.
6. Recheck R36Y confirmed-memory parsing/citations and any downstream preparation consumer before enabling new candidate types. Its current recall filter distinguishes OWNER_TEXT and SOURCE_METADATA. Unknown/synthetic transcript provenance must refuse, not silently become reviewed owner text or lose its source label.
7. Keep protected transcript retention independent from canonical evidence. Do not duplicate full text into forever-retained candidate/snapshot rows to bypass 24-hour TTL. The first slice must refuse proposal/confirmation after source evidence expiry or purge. Any retention of owner-accepted excerpts requires an explicit retention decision and versioned evidence policy before implementation; no silent extension on “accept”.

For future R2 writes, acquire exact command/batch advisory locks followed by canonical voice-session/source and result locks in an agreed global order, pin active owner epochs and both original source version/current target snapshot, and insert candidate evidence + decision atomically. No provider work inside that transaction. Concurrent logout/revocation/version change or stale fingerprint fails closed; same command with different hash conflicts, exact replay revalidates current access before disclosing text. SQL uses explicit UTC conversions for raw Timestamp(3) Date parameters; actual instants/JSON retain zone information.

## Options rejected

- Cast PB into legacy CLIENT: violates persisted subject split and ownership.
- Put text into ownerBrief: falsely labels model text OWNER_CONFIRMED and rewrites historical provenance.
- Mark source transcriptionState completed: invalidates immutable snapshot/source equality and misrepresents the synthetic runner.
- Return raw transcript rows directly: loses current actor/version/expiry/result-chain checks.
- Build a parallel AI extraction/gateway: duplicates policy, operation and budget authority.
- Implement R2 before R1 is tested: mixes content disclosure, schema migration and fact promotion in one critical change.

## Minimum implementation files and verification gates

R1 server first: one new voice reader/projection module, strict shared response schema if needed, dedicated unit tests, and one controller-run native fixture extending the existing real synthetic PB setup. Existing session inspector/assembly stay unchanged unless a separately reproduced defect requires a narrow fix. No schema, migration, gateway admission or transport change.

R1 route/mobile second: one GET route, its auth/bounds tests, mobile API/parser, isolated display component and existing intake screen integration. Current voice journal/upload behavior remains untouched. R2 requires its own exact SQL proposal before editing schema; candidate and understanding legacy V1 tests must stay intact.

Required R1 oracles:

1. Positive actual synthetic gateway completion -> exact owner-only assembled text; all authority/quality labels exact. No DB writes/reservations/dispatch on repeated GET.
2. Wrong actor, same-workspace admin, another workspace/project/source/session, inactive membership, owner transfer and revoke/regrant epoch all refuse without text.
3. Changed intake version/status/revision, source hash/file metadata, manifest or ordered result identity refuse; unchanged confirmed-intake admission works.
4. Forged CLIENT/PB linkage, mismatched AI resultId/final attempt/response evidence, orphan/duplicate/extra segment, uncertain result, unaccounted or wrong hold, missing result refuse.
5. Text tamper, equal-length tamper, newline/Unicode/emoji changes, incorrect character count, missing ordinal, overlong segment and total bound all refuse. Exact whitespace and ordering preserved in the positive case.
6. Purged/expired text or session, expiry during final awaited query, source change during read and commit failure return no text; no TTL extension or repaired evidence.
7. Two native backend connections exercise read against revoke/purge/terminal contention. Verify transaction outcomes, not only mocked locks. Run Date comparisons in UTC, America/New_York and Asia/Tokyo through the real transaction-local timezone wrapper.
8. Route derives actor, rejects unknown/duplicate query fields, forbids unverified user, sets private no-store; mobile discards stale-context responses and never writes text to journal/cache/logs.

R2 future tests additionally prove exact command replay/conflict, quote/source/range hashing, immutable provenance, simultaneous proposal CAS, explicit batch selection, current owner recheck at confirmation, rejection of synthetic canonical facts, expiry/retention boundary, and unchanged R36V/W/X/Y legacy hashes. No success count or coverage percentage is assigned until these tests exist and pass.

## Exit, stop and current non-goals

R1 exit: independent review plus unit/native/auth/UI tests prove protected synthetic text is visible only to its current owner, with original evidence untouched and every semantic/execution authority flag false. Report it as local synthetic review readiness, never provider/customer E2E or transcription quality.

Stop a proposed sub-slice if it needs new provider access, customer audio, authorization/retention expansion, mutation of applied migrations, historical repinning, automatic confirmation, or unresolved cross-ledger ownership. Continue unrelated authorized work through the controller. No external GO, metric increase or whole-product-ready claim follows from this plan.

Next controller decision: approve R1 server-only protected projection and its tests first. R2 remains a concrete follow-on design requiring separate schema/provenance/retention review, not a prerequisite for obtaining useful local R1 proof.
