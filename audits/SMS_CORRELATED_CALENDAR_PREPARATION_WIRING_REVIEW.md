# Actual SMS worker → bounded postcommit preparation

2026-09-10. Authorized after controller's read/mobile checkpoint
`b7cf70379e792511fa57df1ebee09ddbe446b6e2`. Source-only local implementation;
same-model cross-review and native fixture are separate pending gates.

## Narrow implementation

`sms-worker.ts` snapshots PREPARE and STORE flags before its first await. The
original source request hash is copied before admission awaits and used both by
the existing claim CAS and the new helper. No source hash or lease is recomputed
after completion. The helper receives the same frozen claim, original deadline
and signal as temporal consumption; it has its own smaller five-second cap.

Only actual handled + sourceCompleted=true + committed=true establishes the
completion latch, before any preparation await. Known REFUSED keeps completion
without calling the helper. Accepted plus initial/current flags and remaining
original time invokes it once. There is no new allowance when consumption itself
returns after the deadline. The helper outcome (including COMMITTED/unknown/late
metadata) is deliberately ignored for the public source result.

Both the existing inner catch and outer deadline catch consult that latch before
any uncertain-source CAS. Thus a preparation throw or deadline cannot misreport
the already-known source/ACK completion or rewrite it. A missing/false commit
acknowledgment never establishes the latch. A consumption exception or timeout
before acknowledgment keeps the previous uncertain path and never invokes this
helper. Repeated delivery of an already-completed source stays NOT_PENDING.

No model, Google, calendar approval, ACK rewrite, new queue, recovery scanner or
retry is added. The existing outer Promise.race retains its cancellation design:
an uncooperative dependency can continue after the caller's deadline, but its late
settlement is observed by that existing race/inner catch and cannot alter the
published source result. This is not a claim of forcibly terminated work or a
network sandbox.

## Local evidence

- Worker source SHA256 at freeze:
  `94d92a1e9addf4acbc1c932183203ce7b68672420f4609dd2a9a3d466e579eb9`.
- New `test/sms-correlated-calendar-preparation-wiring.test.ts`: 22 tests.
- First combined run: **55/55 PASS**, 2026-09-10 13:17:18 America/Toronto:
  22 new wiring +18 original temporal wiring +11 prior peer wiring +4 calendar
  worker/window controls. No original assertion changed.
- Tests call the real worker but mock lower/helper/DB. They exercise both timer
  catches with unresolved then late resolving/rejecting helper promises, unknown
  consumption acknowledgment, false/missing committed flag, entry OFF→ON,
  current ON→OFF, refused outcome, exact original claim/hash/deadline/signal and
  zero second source CAS/ACK/model calls. They do not prove native SQL or provider
  behavior. The parent's real integrated fixture remains the next gate.
- The new committed=false regression was GREEN on first execution after the
  narrow patch; no historical RED was claimed for that assertion.
- Expanded eight-file run: **178/178 PASS**, 13:19:11, adding the real lower's
  unit suite and existing question-preparation wiring/control regressions.
- First post-wiring TypeScript run found one test-only dynamic environment-key
  index typing error. Replaced that fixture assignment with Object.assign without
  changing its oracle. Fresh root TypeScript then exited 0; scoped lint previously
  exited 0 with no production errors. No guard was relaxed.

Standalone helper review is recorded separately in
`SMS_CORRELATED_CALENDAR_PREPARATION_HOOK_REVIEW.md`; the peer's seven hook tests
and four pre-wiring baseline cases passed with its recorded 74-test run. That
baseline did not by itself certify this newly added worker latch.
