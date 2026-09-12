# Owner SMS weather incident — 2026-09-12, r4

## Scope and repository reconciliation

Objective: repair the reported SMS weather failure and continue isolating the
calendar failure. Existing spec210 owner-only pilot authority and budgets apply;
no timer, employee sends, new consent, automatic retry of completed sources,
store publication, schema migration or credential disclosure.

Product: C:/dev/endvera-astra-r03, codex/endvera-astra-r03.
Start6d835800ea4b65e1d4f71c64659114120d65fb6b; functional release
e2c924d7dd7999921d209b2131f5bd56294fb2c7. Preexisting tsconfig, ingress
scripts/drafts and eight native-test evidence directories preserved.
Brain began clean53b0e48736931a638163e0439c67c31aba6aec39, LOCAL ONLY.

## Proven causes, not inferred from screenshot order

- The20:06:31.857Z weather inbound cmtytfret0001l504sm3vvgdz reached
  PUBLIC_RESEARCH, whose configuration was absent. Its misleading reply claimed
  the AI connection was inactive. No model child was created for this message.
- The20:06:54.794Z calendar inbound cmtytg92u0001l2044listb7p produced model
  child personalmodel_ccc975d21dcb470c9cd8a118170a2c6e and gateway
  gwop_d47a4137812f4f59afc0fc4594c53ba3. Runtime diagnostic was
  WIRE_SCHEMA_INVALID, not missing OpenRouter credentials.
- The webhook requested drainPersonalSms(env,1). That inbound batch limit was
  also applied to pending outbound selection. A preexisting pending reply was
  sent instead of the just-produced reply, causing a one-message lag. Weather
  outbox cmtytfryh0003l5048hphdqvb was accepted20:06:59.389Z; calendar outbox
  cmtytgb630004l204gyy4cdz9 remained pending/attempts0 at20:20Z.

## Changes

- Outbound drain has its own bounded limit10, unchanged50s total deadline and
  canonical identity, approval, budget and uncertainty checks.
- New disabled-by-default public weather tool: MET Norway city-centroid forecast
  for Montreal, today/tomorrow/day-after-tomorrow. Production owner-pilot flag
  ENDVERA_PERSONAL_WEATHER_ENABLED=true; existing external/pilot gates required.
- Only fixed city coordinates go to MET, never SMS text, phone, contacts, GPS or
  history. Fixed HTTPS host/path, identifying User-Agent, no redirects,8s and
 262144-byte limits, source freshness/location/unit/coverage validation, cache
  and429 backoff. Deterministic forecast summary with source/update timestamp.
- Current public research without configuration now says research is unavailable,
  not that general AI is disconnected. Exa search consent remains absent;
  no broad public-search activation or widening of model action authority.
- Intent/answer adapters permit inert empty/null annotations and nullable empty
  tool_calls/reasoning_details. Actual tool calls/refusals or authority-bearing
  content remain rejected. This alone has NOT proved the calendar defect fixed.

## Verification and deployment

193 tests PASS across10 targeted files: personal-intent-openrouter-adapter,
sms-assistant-answer, sms-weather, sms-assistant-routing, personal-assistant-
sms-worker-fencing, sms-wakeup-route, sms-wakeup, sms-worker,
sms-temporal-outbound-selection and sms-temporal-outbound-selection-review.
TypeScript noEmit PASS. Vercel build PASS; provider boundary800 modules,
0 violations;82 existing migrations, none pending. No lockfile/schema change.

Production dpl_B1BEncdqfzmynRZsoMocXvfuq5kf READY, sourcee2c924d7;
both endvera-core-sandbox.vercel.app and
endvera-core-sandbox-afterdesk.vercel.app aliases verified by deployment API.
Build-only r4 diagnostic performed ONE synthetic calendar-intent model attempt,
one public forecast read and ONE separately authorized owner weather SMS.
No build flags saved as defaults, no source replay; durable fixed IDs prevent
repeating these operator probes. Model attempt returnedHTTP200 but no usable
choices[0].message. Safe shape diagnostic null; UI upstream Azure200/320ms,
generation gen-1789245090-RsCqfic2b10Y9xqqZDDF. Root cause still under investigation.
The answer-only diagnostic sanitizer wrongly mapped the intent rejection to
UNKNOWN_DISPATCHED_OUTCOME in this canary; do not interpret that as a new cause.

## Actual weather delivery, explicitly NOT full new-inbound E2E

MET forecast updated2026-09-12T19:23:11Z, retrieved20:31:28.890Z;
24 hourly points for2026-09-13 America/Toronto. Source SHA256
24c4c8b0531fec2ef6900716ce2c4a9382f65b61aa0dabf6fc78bf66667f5358.
Generated summary: approximately18–24 C among available hourly predictions,
rain possible; source attribution and update time included. No model guessed
the weather. This is bounded to Montreal, not arbitrary worldwide weather.

Owner outbound18fddfa4-34ac-4daf-9a35-29b1f1f7119c,
TwilioSM59f242354673d9739c3e16bb36448b10. Signed status callbacks:
sent20:31:32.546Z; DELIVERED20:31:38.109Z. Source-generated weather plus real
outbound delivery is observed; a fresh inbound SMS through the newly deployed
weather branch has NOT yet been observed. Do not inflate Verified-E2E coverage.

Calendar remains unresolved: no observed native device write, and current
candidate response rejected. Signed internal APK11 from the preceding incident
already exists; this server repair requires no additional APK rebuild.
Roadmap22%, local-build46.75%, C2 18/18 are historical and not remeasured.
Owner-only controlled pilot GO inside existing limits; global customer NO-GO.

Primary source requirements checked2026-09-12:
- https://api.met.no/doc/TermsOfService
- https://api.met.no/doc/License (CC BY4.0, commercial reuse with attribution)
- https://api.met.no/doc/locationforecast/HowTO
- https://api.met.no/doc/ForecastJSON

Next: isolate the calendar HTTP200/no-message envelope, retain strict backend
action checks, then correlate a new legitimate incoming message if one arrives.
Never fabricate inbound delivery or ask the founder for another test loop.

## 21:09Z update — provider throttling isolated; bounded replacement deployed

This entry supersedes the unresolved wire diagnosis above, not its historical
observations. The r5 synthetic calendar attempt returned HTTP 200 with an error
body: code 429 and metadata.error_type `rate_limit_exceeded`. The adapter now
retains only the closed diagnostic `PROVIDER_BODY_RATE_LIMIT_EXCEEDED`. No raw
provider error, SMS, key or model content is logged. The canary now uses the
intent diagnostic sanitizer instead of the answer-only sanitizer. Top-level or
choice-level provider errors remain failures even if usable content also exists.
No automatic retry, uncertainty reset or authorization bypass was introduced.

The current public OpenRouter catalog reported the old Azure GPT-5.6 Luna
endpoint unavailable/status -5. An available first-party endpoint was NOT used
because it was outside the existing zero-retention configuration. Reviewed
Azure GPT-5.6 Luna Pro was available/status 0 in the zero-retention catalog, at
the same input/output prices: USD 0.20/1.20 per million tokens. Existing provider,
residency and no-fallback restrictions were retained. Current FX was checked;
the rounded-up conversion and 10% headroom remain within the same budget.

Version 4 creates new route/policy records and preserves version 3. Exact-owner,
consent, credential-presence, prior-route, collision and pilot/budget checks ran
inside the publication transaction. No credential, consent, daily spending
ceiling, pilot expiry or total budget was enlarged. Model output limit is now
2048 tokens, including reasoning, with its bounded cost reservation.
The answer auto route is constrained to the reviewed model; this does not claim
unrestricted cheapest-model routing across the entire OpenRouter catalog.

Two actual r6 synthetic candidate calls succeeded:
- general: ANSWER_INSPECTED, gen-1789246920-TWJaVnPTTyNIE3Q6rbLl;
- calendar-complete: PROPOSAL_INSPECTED_NOT_AUTHORIZED with
  PREPARE_CALENDAR_EVENT, gen-1789246927-X7OPunZGrhfJv7R2JxqH.

Exact reviewed route IDs, fingerprints, prices and canary outcomes are in
openrouter-capacity-v4-20260912.json. Four operator model attempts total in this
weather repair (r4, r5, two r6); one separately authorized owner weather SMS.
Legitimate inbound processing is separate. Latest observed conservative holds:
Twilio 7.800000/15 CAD and OpenRouter 0.267558/20 CAD; these are NOT settled bills.

Functional source 8c5ca2509844e9942c2a24dcde479d61921b6a76. Production deployment
dpl_BMjASnDCsnQyVLaC3yztH8aS82sa READY; both existing production aliases verified.
The production /api/health returns ENDVERA_WEB/alive. Build PASS, 802 provider
boundary modules with zero violations; 199 targeted tests in 10 files and
TypeScript PASS. No schema/lockfile change; 82 existing migrations, none pending.
Build-only canary flags were not saved as project defaults.

Read-only owner workspace check at 21:06Z found no connector account for
endvera_android_device. Granted Android permissions therefore do not yet prove
server association with a selected writable calendar. Native write and closed-app
wakeup remain unobserved. No new inbound is present in the final deployment's
21:04–21:08:55 runtime log window, so full new SMS -> model/weather -> delivered
response is NOT claimed. No further founder test is requested.

Remaining boundary: require an authentic device/calendar association and native
write receipt before calling the calendar path complete. No phone is accessible
to this operator session. Existing internal APK11 was not rebuilt for this server
repair. No employee sends, timers, new purchases, store release or Git push.
Historical roadmap 22%, build-readiness 46.75% and C2 18/18 remain unremeasured;
owner-only controlled pilot GO, global customer NO-GO; aggregate Verified-E2E
coverage is not promoted from these separate observations.

Additional primary sources checked 2026-09-12:
- https://openrouter.ai/docs/api_reference/errors-and-debugging
- https://openrouter.ai/api/v1/endpoints/zdr
- https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1
