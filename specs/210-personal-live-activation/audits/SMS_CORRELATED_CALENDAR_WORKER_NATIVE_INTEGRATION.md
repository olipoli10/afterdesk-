# Accepted SMS → actual local preparation: controller evidence

2026-09-10. Baseline b7cf70379e792511fa57df1ebee09ddbe446b6e2.
Local-only integration; SQL78 unchanged. No live feature flags activated.

## Production wiring reviewed

The controller read the full helper and worker diff, lower consumption function,
existing producer and private projection, plus author and independent audits.
The worker copies initial eligibility and source hash, latches only acknowledged
source completion before awaiting preparation, and preserves that fact in both
its inner error and outer deadline paths. The helper uses one new bounded
Serializable transaction with actual canonical namespace-first producer loading.
The completed source, original claim identity, accepted receipt and exact ACK
are bound before and after preparation. No source lease or result is renewed.

Source outcome and preparation outcome remain different. No successful source
reply is interpreted as Google execution, current action authority, or guaranteed
preparation recovery after process loss. Missing review never triggers a scan or
automatic retry. Generic correlated-calendar approval remains refused.

## Preserved first failure and corrected oracle

Native `postgres-native-1789060890277` finished17:22:37.638Z with102 PASS/1 FAIL;
the owned server stopped and cluster was retained. The real production hook had
already created its one review. The new test incorrectly expected the incoming
source's externalTransportPerformed to be false. Actual sms-inbox insertion sets
that field true to represent the received SMS; preparation must preserve it.
No production change followed. The test now captures the source before worker
processing and compares its historical flag, while separately requiring the
new acknowledgement to remain pending/0 with no outgoing transport.

Native `postgres-native-1789061007082` passed103/103 at17:24:35.625Z;
owned server STOPPED, retained cluster4d7f6896a321473297a8a77a3539e05a.
Three new actual-worker tests cover:

- accepted answer through the production helper, exactly one canonical review,
  private list with both exact SMS texts, repeated source NOT_PENDING and no
  additional review or source/ACK/history/budget changes;
- preparation OFF during processing, then ON for a repeated completed source:
  still no preparation and no automatic restart;
- ambiguous refused answer with preparation ON: known completed source and ACK,
  no calendar review, no second interpretation.

The fixture's previous direct prepare helper is not called by these new cases.
All actual lower/store/producer/reader code and database guards execute. Only
the original model and outbound question HTTP boundary are synthetic injected
transports; this is not proof of a live provider or a user's phone.

## Broader recorded evidence and next checks

Root `root-1789061125441`:5221 PASS,3 historical skips,397 passing files,
finished17:26:30.068Z. Root TypeScript exited0. Author helper/worker178 and
independent102 targeted test runs are separately documented. Mock timer tests
cover late resolution/rejection, unknown consumption, flag changes and isolated
per-source latches; they do not demonstrate a killed network request.

Two additional native tests wrap the **actual** lower function with a
test-only postcommit await, then perform real Google WRITE grant revocation or
wait for real original SQL TTL expiry before returning its actual receipt to
the worker. They pass in `postgres-native-1789061210169`:105/105,
finished17:27:59.385Z, owned server STOPPED. Known source/ACK unchanged, no review,
no extra injected question transport. No fabricated receipt or rewritten clock.
Full `postgres-native-1789061340125`:301/301 across20 isolated migrated clones,
finished17:32:20.065Z, owned server STOPPED; fingerprint78 unchanged.

Peer review correctly distinguished the initial hook from replay: the earlier
budget comparison only began after the first hook, and the two postcommit failures
only compared operations. The fixture is now strengthened to compare budget before
the actual worker and after it, plus budget/receipts/question/expectations at the
actual post-consumption boundary and after each refused hook. Fresh bounded
`postgres-native-1789061590545`:105/105 PASS17:34:18.581Z, server STOPPED,
cluster121e2812a939408083cd7be6ceb09ca0 retained. This receipt proves the stronger
assertions; the preceding full301 receipt is not renamed post-strengthening proof.
Fresh `build-1789061692078` passes17:37:26.380Z, build id
`cXmb7AewODGRd179xhSk1`. Actual built HTTP OFF7 checks pass in
`correlated-calendar-review-http-1789061882068`17:38:02.068Z; owned server
PID63460 stopped and its port refuses TCP. No DB configured or authenticated
read observed in that HTTP probe. It does not activate the worker or approval.

No provider/API activation, secret access, customer data, remote migration,
SMS/call, signed APK, push, deployment or publication occurred. Dashboard stays
roadmap22%, local build46.75%, C2 18of18, real-test NO-GO, Verified-E2E0%.
