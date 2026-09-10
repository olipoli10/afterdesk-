# Personal API refusals — cache-control hardening

2026-09-10. Local correction in progress; no deployed correction claimed.

## Observed and reproduced

Controller read old deployed06e26ce7 phone GET route and current auth helper,
plus the installed Next.js route-handler guide before implementation. Three
unauthenticated HTTPS GETs to the already verified dedicated alias, with no
cookies, no redirect following,15s timeouts and no POST:

- /login:200, private/no-cache/no-store, HTML.
- /api/auth/get-session:200, no-store, exact null session.
- /api/endvera/v1/personal/phone:401, public/max-age=0/must-revalidate, JSON.

Read completed before controller clock2026-09-10T21:45:17Z. No authentication,
pairing, provider call, consent or application data was requested. This confirms
basic endpoint availability/refusal, not a successful Samsung login or setup.
No replayed cache response or disclosure of personal data was observed. The
specific gap is lack of an explicit no-store policy on helper-generated denials;
the public response still requires revalidation and is not proof of an exploit.

Local test at17:46:31 Toronto reproduced5 FAIL/2 PASS. The401 variants (missing
session, wrong role, unverified email), wrong-origin403 and rate429 lacked the
required private,no-store header. Successful GET/native-origin principals were
unchanged controls. Source correction adds only that header to the three existing
Response.json calls. It changes no session eligibility, origin rule, rate policy,
status/body, database access, action permission or successful return value.

Unchanged tests then pass7/7; combined with existing model-route17 and intent-
review-route9 tests:33/33 PASS at17:46:56. Separate reviewer adds10 actual phone-
route/helper cases with mocked authz/effects, no real pairing. Controller reads
that entire test/audit then reruns all four files:43/43 PASS17:50:24. Controller
scoped source/test lint exit0. Peer source diff GREEN; TypeScript follows with
the current local tranche. No new package, database or remote mutation.
