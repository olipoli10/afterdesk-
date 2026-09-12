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
