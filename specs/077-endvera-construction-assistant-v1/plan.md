# Implementation Plan: ENDVERA Construction Assistant V1

## Technical context

- Next.js 16.2.12 App Router, React 19.2.4, TypeScript 5
- Prisma 6.19.3 and PostgreSQL, forward-only additive migration
- Better Auth role/session boundary via existing `requireRole`
- Zod 4 closed schemas
- date-fns/date-fns-tz already installed
- Vitest 4, disposable PostgreSQL integration tests
- no dependency or lockfile change

## Constitution and safety check

- Canonical state resides in PostgreSQL, never LLM memory.
- All actions are authenticated and workspace-scoped at the data boundary.
- External effects remain disabled; simulator names and statuses are explicit.
- Existing Task and money state machines are untouched.
- Raw inbound text is untrusted data and never changes policy.
- Migrations are additive and forward-only; no `prisma db push`.

## Architecture

```text
Portal / Local SMS / Local Email
              |
       normalized message
              v
  authenticated intake service
              |
        raw Message stored
              v
  bounded interpreter -> Zod validation
              v
 membership + project/contact/date policy
              v
 transaction: interpretation + calendar/action + audit
              |
              v
  authorized DTOs -> Projects / Calendar / Inbox / A2 answer
```

## File structure

- `src/lib/construction-assistant-v1/`: closed schemas, parser, hashes and pure policy
- `src/server/construction-assistant-v1/`: server-only queries, transactions and simulator admission
- `src/server/actions/construction-assistant-v1.ts`: authenticated Server Actions
- `src/app/client/projects/**`, `calendar/**`, `inbox/**`: client cockpit
- `src/components/construction-assistant-v1/**`: mobile forms and A2 interaction
- `prisma/migrations/20260831110000_endvera_construction_assistant_v1/`
- `test/construction-assistant-v1*.test.ts` plus disposable-DB integration coverage

## Phases

1. RED contracts and additive schema
2. Workspace/project/contact ownership
3. Calendar and A2 intake/query
4. Provider-neutral inbox and idempotent simulators
5. Exact-version outbound approval and simulated delivery
6. UI, adversarial tests, fresh migration, full gates and Brain

## Post-design constitution check

PASS: no provider, external action, destructive migration, tenant shortcut, LLM direct write, new dependency or inherited Task semantic change.
