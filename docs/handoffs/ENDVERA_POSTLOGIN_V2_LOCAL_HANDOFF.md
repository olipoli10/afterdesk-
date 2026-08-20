# ENDVERA post-login v2 — local handoff

## Verdict

**GO LOCAL for code review. NO-GO for Preview or Production.**

This candidate corrects the registration navigation defect and makes the
operator overview visually consistent with the live ENDVERA identity. It does
not claim that account creation, email verification, or any authenticated
production flow has been exercised.

## Scope and identity

- Worktree: `C:\dev\nightlexicon-postlogin-v2`
- Branch: `codex/postlogin-v2`
- Base: `2fd73593b0c35eba300bd5a8d293ea3ed25d6961`
- Public homepage: not modified.
- Database schema, migrations, model gateway, OpenRouter, voice runtime,
  authentication policy, payments, and role authorization: not modified.

## Completed

1. Added `src/app/@modal/[...catchAll]/page.tsx`.
   - Next.js keeps a parallel route's active slot during soft navigation.
   - The catch-all explicitly replaces the intercepted `/login` modal with
     `null` whenever the user follows `/register` or any other non-login
     route. This prevents the sign-in window from remaining above the client
     registration form.
2. Changed the existing `/admin` shell to the ENDVERA night treatment.
   - Navigation labels remain linked to their existing admin routes.
   - No role, query, count, sweep, or task action changed.
3. Rebuilt `/admin` overview as an operator command surface.
   - It retains the exact existing queue counts and links.
   - It foregrounds queues requiring judgment and states explicitly that task
     actions remain human controls.

## Verification

- RED: `endvera-portal-experience.test.ts` failed before the modal catch-all
  existed.
- GREEN: targeted portal suite: **11/11** tests.
- Mutation proof: temporarily changing the catch-all from `return null` to
  `return <div />` failed the registration-navigation test; source restored
  byte-for-byte to `return null` and the suite passed again.
- Fast suite: **75 files / 1,152 tests PASS**.
- Targeted ESLint: PASS.
- `tsc --noEmit`: PASS, using a temporary local junction to the generated
  Prisma client from the clean portal worktree at the same commit. No Prisma
  command, migration, database connection, lockfile change, or dependency
  installation occurred.
- `git diff --check`: PASS.

## Build result

The local build compiled source and completed TypeScript, then stopped while
collecting page data because `BETTER_AUTH_SECRET` is intentionally absent:

`BETTER_AUTH_SECRET must be set in production. Refusing to start with the default development secret.`

No secret was created, read, copied, or changed to bypass that fail-closed
guard. The build ran with `VERCEL_ENV=development` and no database URL.

## Remaining release blockers

1. The current production/remote state remains an incident under the canonical
   Brain; do not push, preview, deploy, or repair the remote from this lane.
2. A non-production auth environment must be deliberately provisioned before
   testing sign-up: database, Better Auth origin/secret, and transactional
   email configuration must be present and verified by its owner.
3. Test the real client path: homepage -> sign-in modal -> client sign-up ->
   email verification -> `/client`.
4. Test a real admin account at `/admin` for responsive layout, keyboard flow,
   200% zoom and the actual queue data. No authenticated capture exists yet.
5. Founder visual review is still required before a release decision.

## Explicitly not done

- No push, Preview, Production, Vercel environment change, secret access,
  database access, migration, provider request, account creation, or Brain
  modification.
