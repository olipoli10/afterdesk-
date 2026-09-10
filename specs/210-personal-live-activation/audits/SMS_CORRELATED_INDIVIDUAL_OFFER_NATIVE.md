# Individual offer — actual PostgreSQL controller proof

2026-09-10 19:43Z. Reader80a0be51c2c35c83ae6d28b279fb821d24e19831139e6c28634295a8cd1a424d
and route38b22379b8aafe09c350e85b921ec924cfea1f8b2752065b5d6e21fc5aa6b74e
fully read by controller, together with103 author tests,15 peer tests and audits.
Exact unchanged selected V1 evidence is returned with its own separately versioned
offer; no collection replacement or automatic approval. Prior V1 source IDs are
retained; the calendar operation/nonce/authority are not exposed.

Native receipt `evidence/postgres-native-1789069214442/result.json`: **162/162 PASS**,
finished19:41:55.178Z, server STOPPED, SQL79 fingerprint unchanged. Eight new cases
use the actual reader, C2a gate, existing persisted synthetic two-SMS chain and
native transactions, not mocked query results:

- Three timezone sessions UTC/New_York/Tokyo: selected V1 item equals current
  canonical gate item except its later inspection instant; exact fingerprint,
  request hash and expiry, both source identities preserved, no private calendar
  handle, whole historical snapshot unchanged and no approval created.
- Missing READ refuses; actual grant creation enables; actual revocation refuses.
- Foreign actor/workspace and actual owner-member revocation refuse without a
  fallback card or source/history mutation.
- A real C2b earlier claim cannot be offered again; read creates no additional
  operation/transport. The fixture legally closes its test claim UNCERTAIN.
- Real read transaction commits, then actual DB wait consumes the original
  preparation TTL before its wrapper returns: provisional offer is not published.
- Injected acknowledgement error AFTER the real read commit: opaque refusal,
  no provisional offer, unchanged whole history. This models response loss; it
  does not claim a real network fault occurred.

Two earlier C2b negative oracles are strengthened in this same successful run:
wrong hash requires CORRELATED_CALENDAR_APPROVAL_BINDING_CHANGED; pre-expired
budget requires callback entry and CORRELATED_CALENDAR_APPROVAL_CLAIM_REFUSED.
No arbitrary database timeout can satisfy the latter anymore. No production
guard changed. A TypeScript-only callback overload-cast issue in the new injected
ack fixture was corrected before this run. Fresh main tsc and scoped lint exit0.

Author103+peer15 unit tests remain mocked at documented boundaries. This native
run does not authenticate HTTP, execute Google, certify human consent or observe
Samsung. New offer GET still requires next built OFF HTTP smoke proof; previous
build1789068002670 predates these offer files. Current C2c work was kept outside
this run by a coordinated source freeze, released only after the result.

Continue same existing executor/wrapper, private typed approve and mobile wiring.
No SQL79 edit, remote migration, provider/secret, paid call, deployment, new APK or
push. Dashboard unchanged22% roadmap/46.75% localbuild/C2 18of18/real-test NO-GO/
Verified-E2E0%; do not infer a new full-suite count from this targeted run.
