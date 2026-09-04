# Quickstart: Project Brain Assistant Memory R36Y

## Boundary

Use only synthetic confirmed R36X understandings, contacts and existing local prepared-action families in one disposable PostgreSQL database. Configure no provider/credential/transport. Install sentinels that fail on binary reads, network/provider calls, approval or delivery.

## Targeted validation

```powershell
npm test -- --run test/construction-operating-assistant-r36y-assistant-memory-contracts.test.ts test/construction-operating-assistant-r36y-assistant-memory-api.test.ts test/construction-operating-assistant-r36y-assistant-memory-server.test.ts
npm --prefix apps/mobile test -- --run test/project-brain-assistant-memory.test.ts
```

Expected: confirmed-only deterministic recall, complete citations, four-family allowlist, visible frozen prepared payload, separate approval, stable replay and zero external/binary/provider effect.

## Disposable PostgreSQL validation

Apply all migrations to one fresh uniquely named local database, then run:

```powershell
npm run test:integration -- test/integration/construction-operating-assistant-r36y-assistant-memory.itest.ts
```

Acceptance sequence:

1. Build two synthetic tenants and complete R36V→R36X chains with draft, proposed and confirmed history.
2. Ask all eight questions and prove only the exact R36X current-pointer sequence/hash and its citations appear.
3. Add a newer draft and prove confirmed recall is unchanged; concurrently confirm eligible reviews and prove unique monotone sequences plus deterministic `(sequence,id)` current selection; after restart prove new commands require the exact current sequence and hash.
4. Prepare evidence-request, SMS/MMS, voice-call and email artifacts using explicit same-project contacts/content.
5. Verify recipient/channel/full frozen content/citations/version/fingerprint and `PREPARED_UNSENT`; verify no approval/delivery.
6. Replay/race exact commands and verify one receipt/action/binding/decision/audit effect.
7. Attempt body drift, stale memory, ambiguous/deleted contact, unsupported family/question, unauthorized role and cross-tenant/project reuse.
8. Restart server/mobile clients and compare canonical projections.
9. Forge raw SQL citations to draft/unconfirmed/rejected/mismatched candidates, sources, contacts or action versions; verify commit refusal.
10. Trigger provider/binary/network/approval/delivery sentinels and verify zero call.

## Required mutations

- `newer-draft-eclipses-confirmed-memory`;
- `unconfirmed-candidate-is-returned-as-truth`;
- `unresolved-contradiction-is-hidden-or-resolved`;
- `citation-chain-is-optional-or-mismatched`;
- `source-metadata-becomes-job-fact`;
- `unsupported-question-invents-answer`;
- `unsupported-action-family-is-prepared`;
- `recipient-channel-or-body-is-hidden`;
- `preparation-approves-or-delivers`;
- `stale-memory-hash-is-accepted`;
- `stale-memory-sequence-is-accepted-or-current-pointer-is-ambiguous`;
- `replay-duplicates-action-or-receipt`;
- `command-id-body-drift-is-accepted`;
- `cross-workspace-memory-contact-or-action-is-visible`;
- `binary-provider-or-network-path-is-reachable`;
- `history-can-update-delete-or-truncate`.

Each mutation must fail by its exact guard, be restored byte-exactly with before/after SHA-256, then rerun the targeted test.

## Proportional final gates

```powershell
npx prisma validate
npm run validate:provider-boundary
npm run lint
npm run typecheck
npm --prefix apps/mobile test
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run lint
npm run test:run
npm run build
git diff --check
```

This proves only local synthetic behavior. It does not prove provider, founder, customer, store, Preview, Production or deployment readiness.
