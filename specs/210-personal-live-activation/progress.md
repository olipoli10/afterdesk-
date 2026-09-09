# Progress — 2026-09-09

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
