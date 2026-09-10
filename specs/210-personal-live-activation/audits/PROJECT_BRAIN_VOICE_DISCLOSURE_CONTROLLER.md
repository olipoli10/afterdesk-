# Protected transcript disclosure — controller validation

2026-09-10, local continuation. Reviewed plan addendum, actual reader/GET deltas,
author tests, two peer suites and the real PostgreSQL fixture. This is a bounded
confidentiality/deadline fix, not ASR quality, provider, phone or mobile observation.

## Reproduced and corrected

The reader could return a result after its database expiry when commit completed
late; the route could publish a result after expiry during JSON serialization.
Native baseline postgres-native-1789072774657 retained **12 PASS / 3 FAIL**,
20:40:19.537Z: actual committed transactions then original database expiry in
UTC, America/New_York and Asia/Tokyo. No product clock or expiry was extended.
Peer route first **7 PASS / 1 FAIL** and author REDs remain in their audits.

Reader now shares a fixed request wall/monotone deadline, snapshots original
signal/input, rechecks after opaque waits and commit, and registers only exact
known-committed immutable results in a private WeakMap. Publication checks use
the final database TTL anchored before that query, never application wall time
as database time. GET retains its own ten-second entry budget and checks the
private result guard before/after JSON. No forced cancellation or retry claim.
DTO, synthetic-text labels, fingerprint grammar and action authority unchanged.

Final reviewed SHA256:
- reader: 665336638041b4f5a899da599005361fc819822f0ff2c7569b9eb58334ae01a3
- GET: a91b30a452f3f626658ef8b9da8f292ecd7026d2adca2c29fa0da628599979d9

## Verified receipts

- Author/reviewer combined **221 PASS** at16:47:30 local, including fourteen
  peer tests. Six use true GET, reader and WeakMap with SQL/auth mocked; explicit
  +/-24h DB/application offset cases. See peer audit for exact limits.
- Native target **17 PASS**, postgres-native-1789073163426,
  20:46:56.427Z: three post-commit expiry zones, original abort after known commit,
  exact returned publication guard versus JSON copy and original DB expiry.
- Full native **372 PASS / 20 file clones**, postgres-native-1789073284831,
  20:53:47.214Z. All twenty fingerprints79:41de317b70655965d494f1c3e0ea5940.
  Owned servers stopped; clusters retained, not deleted. No remote DB touched.
- Build build-1789073173533 **PASS**,20:51:05.804Z;
  BUILD_ID aMbpazGkwh8wdlUJe0FQF.
- Actual built OFF HTTP **7 PASS**, voice-review-http-1789073510615,
  20:51:50.614Z. Owned PID67692 stopped and TCP port closed. GET/HEAD404 private
  no-store; framework OPTIONS204 and POST/DELETE405 do not have that cache header.
  No DB configured and no authenticated HTTP read is claimed.
- First full root root-1789073273907 **6113 PASS / 1 FAIL / 3 historical skips**,
  20:49:35.063Z. Existing binary130-file Git test exceeded5000ms while other heavy
  validations ran. Receipt retained; contention is a hypothesis, not proven cause.
- Unchanged full root rerun alone root-1789073905188 **6114 PASS / 3 historical
  skips**,20:59:55.800Z. No timeout or failing test changed for this rerun.
- Root TypeScript and focused lint exit0; final diff check exit0. Applied SQL and
  user-owned tsconfig/drafts preserved. Node dependency junction not modified.

## Next / limits

Reader/GET repair **DONE_LOCAL**. No new APK, real transcription, public exploit,
provider call, deployment, secret access or new founder session. Private local
publication checks do not guarantee when a remote client consumes old bytes.
Continue PILOT_BACKEND_APK_UPGRADE_PLAN.md: historical pilot schema70 versus
local79 needs reviewed upgrade and coherent backend/APK before distribution.
Dashboard remains roadmap22%, local build46.75%, C2 preparation18of18,
real-test NO-GO, Verified-E2E0%. No rubric promotion.
