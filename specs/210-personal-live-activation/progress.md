# Progress — 2026-09-09

## Continuing execution — Google and durable SMS worker

New PersonalAssistantOperation table preserves all historical no-transport
CHECK constraints. Real inbox writes to the old prepared-operation table would
have failed: corrected the live-table boundary rather than weakening old CHECKs.
Encrypted connector credentials use AES-256-GCM, random nonces and workspace /
account / purpose binding. Google consent uses state, PKCE and a single-use
browser launch/correlation cookie suitable for native-app browser handoff.
Callback rechecks owner and account version; credentials and grants are revoked
locally and token bytes cleared. Google-side grant revocation remains a separate
owner setting, explicitly disclosed in the app. No remote revocation claim.

Mobile Google card authenticates through the existing cookie transport, checks
the launch URL against the configured backend, opens consent in the browser,
reloads status and reads tomorrow's primary calendar. No local fixture fallback.
Google events are paginated with a bounded incomplete-result refusal. Workspace
timezone and DST are used for SMS queries. Only exact supported day queries are
routed as reads; a multi-action sentence is not silently reduced to one read.

SMS worker rechecks phone/owner/grants at processing time, claims the durable
operation once and passes admitted SMS provenance to the existing guarded engine.
One unsent reply is persisted. No model/provider authority is granted. A crash
or unknown engine outcome is held for review, never automatically replayed.
CLI: node node_modules/tsx/dist/cli.mjs --tsconfig scripts/personal-worker.tsconfig.json scripts/run-personal-sms-worker.ts
Use --once for one bounded pass. Without configuration it prints
PERSONAL_SMS_WORKER_DISABLED and exits without network or DB work.

Fresh validation:
- Focused unit suite: 57/57 pass; root TypeScript passes.
- Mobile TypeScript and personal-Google contract tests: 2/2 pass.
- Real disposable PostgreSQL: 12/12 pass, including concurrent intake, durable
  replay, one-use OAuth callback, encrypted retention, cross-workspace refusal,
  revocation races, single worker execution and uncertain-outcome hold.
- Every completed PostgreSQL run removed only its uniquely named fresh cluster.
- Intermediate failures preserved: connected/grant fixtures initially violated
  existing CHECKs; a test used the wrong relation name; Windows PowerShell 5
  invocation failed before cluster setup whereas the available PowerShell 7
  invocation completed. Corrected tests were rerun, not reclassified as live.
- Initial bare tsx worker could not resolve server-only. Explicit server-runtime
  tsconfig resolves Next's server-only empty module for this server CLI only;
  actual default-disabled CLI then passed. App/browser boundary unchanged.
- Static boundary at Google stage: 1279 modules, 0 violations. Rerun after worker.

Continue without founder GO: bounded outgoing approval/transport and receipts,
phone pairing, approved calendar writes, deployment/Android preparation.
No actual provider call, SMS, phone call, OAuth consent, deployment or spending.
Historical dashboard unchanged; no rubric promotion.

## Current code

`/api/webhooks/twilio/sms` accepts bounded URL-encoded signed payloads when the
existing SMS/global gates and a bounded personal-pilot deadline are configured.
No Host or X-Forwarded header is trusted for signature verification. All form
fields contribute to the signature; duplicate fields and MMS are refused.
The HMAC verifier matches Twilio's published fixed vector; production SDK parity
and actual provider delivery remain to be observed.

The service requires exactly one preverified phone identity, active owner/admin
membership, an actually connected account and an active inbound grant. It stores
a received connector operation under a PostgreSQL transaction/advisory lock.
Identical deliveries return the same receipt; account/message payload conflicts
are refused. Empty TwiML acknowledges durable receipt without sending a reply.
No assistant worker or outgoing transport is yet attached to this new inbox.

CLI `node scripts/personal-live-preflight.mjs` reports presence booleans and
missing names, never credential values. Configuration presence is never live
proof. No secret file was created, no existing secret was displayed.

## Validation

- Initial envelope + HTTP tests: 26 pass.
- First expanded run: 39 pass / 1 fail caused by a test-table array being
  expanded as arguments. Typecheck also rejected that test table and an
  incorrect expect-error annotation / inferred ProcessEnv type.
- Corrected test table and explicit CLI environment annotation: 40 pass,
  typecheck and focused lint pass.
- Review found the new ingress also had to honor the existing global/capability
  kill switch. Added that gate and four refusal tests before any deployment.
- Final focused run including existing activation regression: 51 pass / 0 fail;
  TypeScript passes. No skipped tests in this selected set.
- Final static provider-boundary pass: 1263 modules / zero violations; focused
  lint and diff checks also pass after the final gate import.
- Inbox tests mock Prisma: not a concurrency, restart or real PostgreSQL proof.
- No live provider call, SMS, phone call, deployment or purchase occurred.

## Next execution

1. Finish real disposable-PostgreSQL tests for concurrent inbox replay/revocation.
2. Implement Google consent and encrypted credential storage using existing
   calendar builders. Current consent still has no usable URL or token store.
3. Build the durable inbox worker and outgoing bounded replies/approvals, then
   delivery callbacks. Do not mark incoming receipt as a completed command.
4. Reconcile actual deployment project and required backend/storage/Android
   configuration. node_modules is a junction; avoid changing its shared target.
5. Obtain the concrete current CAD budget, provider account configuration and
   personal account/phone connection when their dependent actions are ready.

The three-minute heartbeat is ACTIVE. Overall status IN_PROGRESS / NOT LIVE.
Historical roadmap 22%, build 46.75%, C2 18/18, real-test NO-GO, Verified-E2E 0%
are retained; this block makes no rubric transition or new metric claim.
