# Implementation Plan: R26 Project Email Inbox

## Technical context

- TypeScript strict, Next.js App Router, Prisma/PostgreSQL, Zod and Vitest.
- Shared Expo Router iOS/Android client with durable native outbox.
- Existing R14 selected evidence, R18 unified intent and R24 exact approval
  patterns are reused; the existing transactional platform mailer is not a
  project mailbox connector.
- No new dependency, provider SDK, credential, network path or public webhook.

## Architecture

1. Define a provider-neutral normalized email envelope, opaque account/folder/
   cursor references, trusted disabled-adapter assertion and strict projections.
2. Add forward-only PostgreSQL account, inbound event, evidence-link, prepared
   draft and immutable decision models.
3. Prepare/revoke a local account with separate metadata, selected-content,
   draft and disabled-send capabilities.
4. Admit one normalized event under an advisory lock; resolve workspace,
   account, sender, project and contact; persist one canonical email and route
   verified content through R18 using explicit email provenance.
5. Link only R14 evidence already admitted to the same workspace/project.
6. Prepare and approve exact versioned email drafts, while keeping transport and
   provider-side draft creation disabled.
7. Expose a protected mobile API and one shared Email inbox with restart-safe
   account, admission, draft, approval and revocation commands.
8. Prove replay, conflict, cursor, restart, role and attachment boundaries on a
   disposable PostgreSQL database.

## Source structure

- `src/lib/construction-operating-assistant-r26/`: contracts and deterministic policy.
- `src/server/construction-operating-assistant-r26/`: transactional email inbox service.
- `src/app/api/endvera/v1/mobile/email-inbox/`: protected mobile route.
- `apps/mobile/src/app/(app)/email.tsx`: shared iOS/Android cockpit.
- `apps/mobile/src/lib/email-inbox.ts`: parsing and commands.
- `prisma/`: forward-only R26 persistence.
- `test/` and `apps/mobile/test/`: RED, integration and mobile proof.

## Constitution Check

- **Authority**: PASS — local code/test/disposable PostgreSQL only.
- **Safety boundary**: PASS — no OAuth, provider call, mailbox read, send or external write.
- **Canonical state**: PASS — PostgreSQL and immutable decisions, never the model transcript.
- **Tenancy**: PASS — every account/event/draft/evidence lookup is workspace scoped.
- **Evidence**: PASS — selected admitted evidence only; no remote fetch or invented attachment facts.
- **Replay/concurrency**: PASS — advisory lock plus unique identities and fingerprints.
- **Role safety**: PASS — owner/admin full, field minimized/assigned only.
- **Rollback**: PASS — local revoke and application rollback; forward-only migration.
- **Economics/demand**: PASS — zero provider spend; real cost and willingness to pay remain unknown.

## Safety gates

- no Gmail/Microsoft authentication, SDK, API or network;
- no raw OAuth secret, access token, refresh token or delta URL;
- no unrestricted mailbox or implicit remote attachment read;
- no ambiguous project write or cross-workspace link;
- no provider-side draft, email send or delivery claim;
- exact version/hash approval and local revocation;
- no field-worker body, recipient, financial or evidence leakage.

## Validation

- R26 unit and disposable-PostgreSQL integration tests plus relevant R14/R18/R24 tests;
- Prisma format/validate/generate and fresh forward-only migration rebuild/status;
- full mobile tests, lint, typecheck, Expo doctor and local iOS/Android/Web export;
- root lint/typecheck, serialized full unit/integration gates and Next.js Webpack build;
- Spec Kit analysis, constitution recheck, audit review, `git diff --check` and zero-provider proof.

## Delivery and continuation

Commit the R26 specification and queue transition, then implementation and
closeout as coherent local commits. Mark R26 DONE and enqueue R27 in the same
transition. Do not push, deploy, preview or stop the persistent goal while
authorized roadmap work remains.
