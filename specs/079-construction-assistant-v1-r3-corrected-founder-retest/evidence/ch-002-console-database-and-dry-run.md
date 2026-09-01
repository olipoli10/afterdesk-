# CH-002 — Integrated console, disposable database and dry run

Status: DONE

- The authenticated `/client/construction-retest` route is available only in development with the explicit R3 local-test flag and named disposable database guard.
- The console presents one server-owned action at a time, keeps the duplicate identity internally and renders Projects, Calendar and Inbox together.
- The database was recreated empty and all 34 forward migrations were applied before the founder invitation.
- The exact PostgreSQL dry run reproduced the nine-step path without creating founder evidence or external activity.
- The dry run exposed one real association defect: the exact Laval inbound update was stored at workspace scope. A targeted PostgreSQL regression reproduced it before the bounded correction.
- The corrected path stores the uniquely interpreted Laval project identity while keeping the message unsupported, inventing no fact and creating no consequential action.
- Targeted R3 tests, the 1,189-test fast suite, 97 serialized integrations, lint, typecheck and the Next.js 16.2.12 Webpack 99-page build passed.
- The source R2 worktree remains clean and byte-identical; package-lock, Prisma schema, migrations and historical specs are unchanged.
- External/provider calls and transports: 0.
- No founder timer or founder-observation artifact exists.

Result: `FOUNDER_RETEST_PREFLIGHT_READY`.
