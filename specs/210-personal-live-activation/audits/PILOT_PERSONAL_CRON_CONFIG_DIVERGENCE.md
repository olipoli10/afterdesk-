# Personal deployment cron configuration divergence

## Scope and observed state

Read-only source/package investigation, 2026-09-11. Local HEAD inspected:
`68b29611c19cf1a7e5e97e0c3cf83324fe97af17`. No CLI deployment, network request,
credential access, route invocation, test run, or product configuration edit by
this reviewer. The only resulting edit is this audit.

Controller-reported deployment `dpl_Cm6AFJxkXrsJWeFq4Z8kY3yKtPfa` was READY,
bound to source `8d462`, with the intended personal build command but an actual
cron definition `/api/cron/maintenance`, schedule `0 * * * *`.
This is a configuration divergence, **not evidence that a cron ran**.

Controller containment, reported separately: exact dedicated project
`prj_cEvjMH8iJ2C9khbZ0vsQlGKQ4Y75`, PATCH project crons `enabled:false`, exit 0,
`disabledAt:1789088830777`; GET confirmed disabled at 01:07:30Z. The definition
persists. This reviewer did not independently perform that remote verification.

## Local facts and causal inference

- Root `vercel.json` contains exactly the observed hourly maintenance cron.
- `specs/210-personal-live-activation/deployment/vercel.personal.json` contains
  the intended direct `validate:provider-boundary && next build` command and
  `crons:[]`.
- `.vercelignore` excludes `specs`, but does not exclude root `vercel.json`.
- Installed Vercel CLI 59.15.1, under npm-cache `_npx/09c35f05f7dedb59`, really
  resolves `--local-config` (chunk-NHTF332K.js). Its deploy command loads that
  local configuration; Now.create spreads it into the request body
  (chunk-AUGK2HIT.js). The client serializes deployment options plus uploaded
  files (chunk-562OXD3F.js).
- The same client's `pickOverrides` forwards only buildCommand, devCommand,
  framework, ignoreCommand, installCommand and outputDirectory as project
  setting overrides. It does not include crons. Therefore the observed correct
  build command does not establish that the root-file cron definition was
  neutralized throughout the remote build/deployment pipeline.
- `scripts/vercel-build.mjs` and `next.config.ts` do not replace the cron
  configuration. The personal build command avoids the ordinary production
  script's `prisma migrate deploy`; that is a separate property from scheduling.

**Inference, not demonstrated server precedence:** the uploaded root config is
the likely source of the surviving cron while the personal build override was
accepted separately. Local code shows two configuration channels, but does not
prove which remote component selected the cron or the exact empty-array merge
semantics. Repeating the same `--local-config` command is not a demonstrated fix.

## Why OFF provider switches are not sufficient containment

`src/app/api/cron/maintenance/route.ts:56` checks CRON_SECRET/Bearer only before
starting fifteen jobs at line 77. It has no personal/global OFF gate. Both GET
and POST call the same handler. Jobs include DB transitions, notification-attempt
bookkeeping, file purges and money-intent processing. Thus downstream transport
OFF flags do not make the maintenance handler read-only or a no-op. No actual
maintenance execution, provider effect, deletion or data loss was observed here.

## Minimal next-publication prevention

1. Keep the **dedicated personal project's scheduler disabled**, and freshly
   verify that state before and after each publication. Do not touch the public
   project's scheduler, global root config, or shared `.vercelignore`.
2. Record both actual deployment cron definitions and project scheduler state.
   A nonempty definition with scheduler disabled is **disabled scheduling**, not
   a cron-free deployment. READY and correct buildCommand do not replace these
   checks.
3. If removal of the definition is required later, review a personal-only
   publication source/config adjustment that makes the deployment-root config
   unambiguous. Bind any such source transformation explicitly to its bytes;
   do not silently overlay root config and still claim an unchanged clean
   checkout. No new staging framework is justified by this incident.
4. After that bounded change, verify actual deployed crons are empty and the
   personal scheduler remains disabled. Until then, retain the divergence and
   containment facts above rather than claiming the config issue is fixed.

No source correction or new maintenance gate was implemented in this review.
