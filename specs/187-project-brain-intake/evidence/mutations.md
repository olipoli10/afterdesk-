# R36V Proportional Mutation Evidence

**State**: `COMPLETE`

All five proportional mutations were executed locally, observed RED through their exact guards, restored byte-exactly and rerun GREEN. This evidence closes the mutation portion of T025 only; release closeout remains subject to the final gates.

## M-01 — Invented owner fact

- Status: `RED OBSERVED / BYTE-EXACT RESTORE VERIFIED / GREEN OBSERVED`.
- Target: `src/server/construction-operating-assistant-r36v/project-brain-query.ts`.
- SHA-256 before mutation: `6bb0ee0853f753d1399e0fe0b302dfa6f8136767e080541624cb92491b6cba61`.
- Mutation: replaced the confirmed owner summary with the invented assertion `Le chantier est terminé et prêt à facturer.`.
- Expected guard: every project-memory answer must remain derived from the owner-confirmed snapshot.
- RED observed: query suite reported 44 passing tests and 1 failing test; the exact owner-confirmed-text assertion rejected the invented answer.
- Restore: original bytes restored.
- SHA-256 after restore: `6bb0ee0853f753d1399e0fe0b302dfa6f8136767e080541624cb92491b6cba61`.
- GREEN observed: query suite reported 45 passing tests and 0 failures.

## M-02 — Cross-workspace tenancy bypass

- Status: `RED OBSERVED / BYTE-EXACT RESTORE VERIFIED / GREEN OBSERVED`.
- Target: `src/server/construction-operating-assistant-r36v/project-brain-query.ts`.
- SHA-256 before mutation: `6bb0ee0853f753d1399e0fe0b302dfa6f8136767e080541624cb92491b6cba61`.
- Mutation: removed the `item.workspaceId === input.workspaceId` predicate from confirmed-snapshot selection.
- Expected guard: a different workspace must receive neither a snapshot nor an answer.
- RED observed: query suite reported 43 passing tests and 2 failing tests; the foreign snapshot was selected and answered.
- Restore: original bytes restored.
- SHA-256 after restore: `6bb0ee0853f753d1399e0fe0b302dfa6f8136767e080541624cb92491b6cba61`.
- GREEN observed: query suite reported 45 passing tests and 0 failures.

## M-03 — Stale mobile version

- Status: `RED OBSERVED / BYTE-EXACT RESTORE VERIFIED / GREEN OBSERVED`.
- Target: `apps/mobile/src/lib/project-brain-intake.ts`.
- SHA-256 before mutation: `aaf7f3983b0a67c365df6cc045c32c9d2ebd4390ee524072a4978c9129dcc053`.
- Mutation: advanced each source command's expected state version by one extra version (`initialStateVersion + index + 1`).
- Expected guard: the mobile queue must bind each source command to the exact sequential state version.
- RED observed: mobile targeted suite reported 37 passing tests and 1 failing test; expected versions `[4, 5]` became `[5, 6]`.
- Restore: original bytes restored.
- SHA-256 after restore: `aaf7f3983b0a67c365df6cc045c32c9d2ebd4390ee524072a4978c9129dcc053`.
- GREEN observed: mobile targeted suite reported 38 passing tests and 0 failures.

## M-04 — Direct provider execution exposure

- Status: `RED OBSERVED / BYTE-EXACT RESTORE VERIFIED / GREEN OBSERVED`.
- Target: `src/app/api/endvera/v1/mobile/project-brain-intake/route.ts`.
- SHA-256 before mutation: `ee01fe91bfdd2ee122a3704d08c462fa8ae9bfdf5ec5402716f281a30a41299e`.
- Mutation: imported `@/server/construction-operating-assistant-r37a/sealed-provider-executor` into the local-only route.
- Command: `npm run validate:provider-boundary`.
- Expected guard: a local-only R36V surface must not expose a direct provider-execution path.
- RED observed: provider-boundary validation refused the route with `R37O_DIRECT_PROVIDER_EXECUTION_EXPOSED`.
- Restore: original bytes restored.
- SHA-256 after restore: `ee01fe91bfdd2ee122a3704d08c462fa8ae9bfdf5ec5402716f281a30a41299e`.
- GREEN observed: provider-boundary validation reported 567 modules inspected and 0 violations.

## M-05 — Exact replay protection

- Status: `RED OBSERVED / BYTE-EXACT RESTORE VERIFIED / GREEN OBSERVED`.
- Target: `src/server/construction-operating-assistant-r36v/project-brain-intake.ts`.
- SHA-256 before mutation: `25e5b6d25b11ec3cf1d6589e594252895f91a5a65cab58702c464ba21a0020d7`.
- Mutation: inverted the body-bound replay guard from `existing.commandHash !== commandHash` to `existing.commandHash === commandHash`.
- SHA-256 while mutated: `aec9f44fdd1d9f31dc78d22ab6607151e8e5fa48b053fe15a58ffaeecfef94f2`.
- Expected guard: exact command bodies replay one retained effect while the same command ID with changed content refuses as `PROJECT_BRAIN_IDEMPOTENCY_CONFLICT`.
- RED command: the R36V Project Brain PostgreSQL integration test on a fresh database after all 63 forward migrations.
- RED observed: 31 tests ran; 24 passed and 7 failed. The source-drift assertion resolved as a replay instead of rejecting, while exact BRIEF, SOURCE, SUBMIT, CONFIRM, REJECT and concurrent replays threw `PROJECT_BRAIN_IDEMPOTENCY_CONFLICT`. Three additional failures were transaction/hook cascades after the deliberate corruption and are not counted as the primary signal.
- Restore: original guard bytes restored immediately.
- SHA-256 after restore: `25e5b6d25b11ec3cf1d6589e594252895f91a5a65cab58702c464ba21a0020d7`.
- GREEN observed: the same PostgreSQL target reran on the reset disposable database with all 63 migrations and reported 31 passing tests, 0 failures.
- Disposable server `endvera-r36v-m05-replay-proof` was stopped and removed.

## Safety boundary

All five observed mutations were local and restored before continuing. No provider call, credential read, customer data, external transport, external write, spend, deployment, store action or Git push occurred. External effect count: `0`.
