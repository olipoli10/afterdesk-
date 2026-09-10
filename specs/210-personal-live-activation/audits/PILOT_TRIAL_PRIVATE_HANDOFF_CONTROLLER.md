# Actual private trial preflight — retained refusal

2026-09-10, source a8844c0638e40127c80ae667e0efa20d31b0fde5,
tree 9b4810c2c5224a57d60249b43b76a0c906be8864.

Main read the complete bridge, author tests, eight peer tests and peer audit.
Fresh controller combined69 PASS at19:24:34. Root6742 PASS/447 files plus three
historical skips at23:18:24.735Z precedes the eight new peer tests; no inflated
full-root count. Failed root6712/28 remains retained at the previous commit.

Owned clean checkout C:/dev/endvera-personal-trial-preflight-20260910 points to
this commit. Migration catalog a9ebecf12c010c42090b01c64c5683e275fcf779c432467a56eb06ad5e2a1f93
is byte-identical to the managed before70 baseline's local input catalog.
Actual runner checkout hash a070be8e6e48c5c38c736c028313644ccdb7061f73a41c1c4d37d89d2755d62c
reflects exact Git CRLF conversion, not an executable source change.
Node hash96f768b95e8e9d443f5eead1cb2d199744923320bb8240d2c3129362e7ae2a5d;
installed Prisma CLI c2a77456b70e8ba1e640e122824ed694433828a7c0d76ff3db7fc376b4b0e1a0.
Generated client is owned/read-only copied; shared dependencies remain unchanged.

## Actual transport

Nonsecret physical bridge session82755: READY, invalid fixed sentinel plus EOT,
fixed REFUSED, exit1. No sentinel echo. No child/network for invalid ingress.
Two later admission-only starts were cancelled with empty EOT before forwarding
any credential. Connector response is prose, not JSON; orchestration has no URL
global; connector returns the verified endpoint's pooled alias. These admission
issues were reconciled with exact role/password-shape/known-host/database parsing
and construction of the metadata-verified direct host and strict TLS options.
No alternate target or permissive URL is admitted.

Credential lookup results stayed inside tool orchestration and were never sent
to model output, files or shell arguments. Private nested stdin handoff was used.
Raw mode suppresses terminal echo; it does not certify tool-service audit secrecy
or secure memory erasure. No credential is stored in this audit.

One credential-bearing invocation, session32239, reached the real Prisma child.
Final fixed bridge REFUSED/exit1. Preserved private receipt:
`.scratch/pilot-trial-prisma-f2797cce-67d3-4998-bbcf-b9c8b54e8619/receipt.json`
under the owned clean checkout: PREFLIGHT_REFUSED, childExit0, automaticRetryfalse,
migrationInvokedfalse, executionAuthorizedfalse, dataPreservationVerifiedfalse.
Child0 proves its bounded read completed, NOT final identity/history acceptance.
Original child snapshot was not retained; exact failing predicate remains unknown.
No automatic Prisma retry or migration followed. T explicitly suspended; fresh
metadata confirmed idle/suspendedAt2026-09-10T23:30:45Z.

## Separate diagnostic, not a recovered native result

Same fixed metadata SQL via Neon connector in READ ONLY transaction returned
correct database/role/sessionRole, PG180006, readOnlyon and70 migrations, but
pg_stat_ssl.ssl=false. Private snapshot:
`.scratch/pilot-trial-connector-diagnostic-20260910T2336Z.json` in main worktree.
Pure validator refuses TARGET_HISTORY; a clearly hypothetical local clone with
only tls=true passes all history checks, hash47e1af336b1dee8ac0ed63b01e5833a926ccb0e359652688bebb9425c7564343.
The original snapshot is NEVER changed or represented as a PASS. Connector
transport is not the native Prisma transport; TLS predicate is a likely cause,
not a confirmed diagnosis of the original invocation. T suspension requested
again after the separate diagnostic.

Primary sources checked September10: https://neon.com/docs/security/security-overview
describes TLS at Neon proxy; https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql
documents sslmode=require and sslaccept=strict. These documents alone do not
prove this run's negotiated client TLS. Review semantics before changing gates.

Next: fixed nonsecret failure-stage diagnostics, bounded peer review, then a
justified corrected read-only trial if appropriate. Migration remains disabled.
Main68/pilot70 untouched; managed aggregate before70 capture remains preserved.
No new APK, deployment, owner consent, Twilio/OpenRouter dispatch or live feature
claim. Heartbeat ACTIVE, campaign incomplete; dashboard remains22%/46.75%/
C2 preparation18of18/real-testNO-GO/Verified-E2E0%.
