# Owner SMS silence and Android association — 2026-09-12

## Scope and authority

Current owner request: identify and fix unanswered SMS and calendar setup.
Existing ENDVERA-PERSONAL-20260910-100CAD envelope expires 2026-10-10T01:18:26Z;
no renewal, employee/customer messages, purchases, store publication or timer.
Source worktree C:/dev/endvera-astra-r03, branch codex/endvera-astra-r03.
Initial Brain 9a3e7d57dd039e32a65745451a5a0af2ff0e867c was clean but its 03:10Z
deployment snapshot was stale. Current production receipts below supersede it.
Unrelated tsconfig.json, ingress scripts/drafts and prior PostgreSQL evidence preserved.

## Observed causes (not inferred from health200)

1. Incoming operation cmtymu44r0001i904d4t75rrk at17:01:44Z completed its worker.
   OpenRouter returned HTTP200 (provider generation gen-1789232507-g8inJbS4poBUVPdHASbj).
   The answer contract rejected a current-information request; child
   answer_ea04c0f056774a00a9bec9b03519468d became uncertain. The reply outbox
   cmtymucs30004i90428nomlli remained pending/attempts0, NOT a failed Twilio delivery.
2. The outbound tariff review timestamp was2026-09-11T14:03:58.4812170+00:00.
   Its old24h gate expired at10:03Toronto, before this SMS. The budget was not
   exhausted. The actual production SQL selector finds the pending reply.
3. Calendar candidate transport forced temperature0, although OpenRouter's
   published GPT-5.6 Luna endpoint parameter lists do not include temperature.
   Strict require_parameters filtering rejects this request before generation.
   One controlled old-format intent canary returned HTTP_ERROR; no model
   generation or action-success claim is made for that attempt.
4. Owner workspace had no connected endvera_android_device or google_calendar
   account. Android7/7 permissions did not perform server association. The
   temporal authority and outbound SQL also excluded Android while the canonical
   calendar-confirmation authority already supported it.

## Corrections

- 73dc0a71: bounded explicit reviewed Twilio rate validity; legacy24h fallback;
  maximum7days, never beyond pilot expiry. Current production review17:21:28Z,
  valid through2026-09-19T17:21:28Z. No rolling renewal or budget increase.
- 73dc0a71: safe diagnostic ANSWER_REQUIRES_RESEARCH and honest missing-sources
  response, sanitized worker/drain diagnostics. No unsourced forecast published.
- 2ab70ca1: canary audit ledger corrected after a failed pre-dispatch build;
  application operation-kind constraints were NOT relaxed.
- a0a65115: Android11 permission review selects a writable calendar, registers
  the device, verifies LINKED/calendarWriteEnabled, and distinguishes association
  failures from permissions. Primary calendar preferred; existing selection preserved.
- 73175ad2: provider-specific Android calendar scopes accepted in temporal and
  confirmation outbound SQL; revocation/version/identity/source guards retained.
  Uncertain model results return an honest failure notice rather than silence;
  lost source claims still refuse completion. No legacy interpreter fallback.
- 1f1d7cb8: intent transport omits unsupported temperature, keeps strict schema,
  fixed provider/model, token ceilings and deterministic proposal validation.
- c47da797/9400fe79: closed diagnostic codes for wire truncation, shape, model
  mismatch and proposal/source binding. Live dispatch records the safe code;
  arbitrary injected diagnostic text is not logged, and logger failure cannot
  skip durable uncertainty. No contract relaxation or automatic retry.

## Tests

- Mobile:78files/785tests PASS; mobile typecheck and scoped lint PASS.
- Root final intent/transport/dispatch/prompt/temporal/review suite:8files/170tests PASS;
  root TypeScript and scoped lint PASS. Earlier targeted runs86,225,143 and59
  plus67/80 PASS overlap; do not sum them as distinct coverage.
- Native PostgreSQL17.11,82migrations, isolated new clusters and one database per
  file: temporal-registry174/174 and confirmation25/25 PASS. Six added Android
  cases cover active grant, wrong provider scope and revoked grant. An earlier
 174-test run had3 new fixture errors (invalid selector limit and revoked scope);
  fixtures fixed, then full file rerun. No production database/schema changes.
- Retained passing clusters: personal-pg-native-d511579c182349ac8fab10c870eb2bfe
  and personal-pg-native-ad0fe35aebd14a8bbbb85b421551a724 under ignored .scratch.
  Both disposable servers stopped. No cluster or evidence deleted.

## Bounded real-provider evidence

All calls use synthetic text, current owner inference authority, durable CAD
and account-USD budget reservations, fixed case IDs and no automatic replay.

- r1/general: ANSWER_INSPECTED, openai/gpt-5.6-luna,
  gen-1789233981-PPDKFGIpJ8jSKGsXkIBL,324prompt/195completion tokens;
  OpenRouter account log USD0.000299. Response fingerprint
  sha256:46c824917704b7d4e484359cea52cdfdeee86671cee39ce1670e2ab65a076a93.
- r1/current-sources: UNCERTAIN/ANSWER_REQUIRES_RESEARCH; correctly not a forecast.
- r1/calendar-intent: DISPATCH_OUTCOME_UNCERTAIN/HTTP_ERROR (old temperature wire).
- The first self-SMS probe refused before preparation because two active legacy
  SMS identities exist. It now binds exactly the verified identity of the
  reported incident; does not choose a number arbitrarily or replay incoming SMS.
- r2/calendar-intent after temperature removal: HTTP200,
  PROPOSAL_INSPECTED_NOT_AUTHORIZED/CLARIFY,
  gen-1789235699-YT3LLGZMxw7c9caryHBt. No calendar action was authorized.
- r2/calendar-complete: HTTP200 but DISPATCH_OUTCOME_UNCERTAIN/INVALID_RESPONSE.
  Synthetic title and 14:00-15:00 request was rejected before action authority.
  This disproves treating the successful CLARIFY probe as full calendar readiness.
  Follow-up diagnostics distinguish wire truncation from proposal/span validation;
  no weakening of deterministic validation or replay of customer SMS.
- r3/calendar-complete: PROPOSAL_INSPECTED_NOT_AUTHORIZED/PREPARE_CALENDAR_EVENT,
  gen-1789236628-bMeHIka3n64NsQAp8a7T, fingerprint
  sha256:e74d0aa344876df64752d94fd880212df3bc9a6a1998d802d09d5229d5df1ec8.
  r2's exact rejected field was not retained. r3 does not prove intermittent
  rejection eliminated; new live diagnostics are required for a future rejection.
  Six model canary attempts total in this repair (one rejected before generation),
  separate fixed IDs and durable reservations; no production automatic retry.
- Self-SMS operation467b4e08-2275-4037-9f26-dbca442443b0, Twilio
  SM851dc833104c830defa9ead7fa697649, accepted17:55:23.825Z. Signed provider
  callback persisted sent17:55:25.273Z and delivered17:55:26.745Z. One explicit
  technical SMS, not a replay and not a generated answer to a new inbound SMS.
- Budget reservations after probes: Twilio6.50/15CAD; model0.1962/20CAD.
  These are conservative holds, not settled provider charges. Ceilings unchanged.

## Release state and limits

Backend2ab70ca1 dpl_CUGoVnRvokRMHa7YTsh7WTXBWLmC READY on both production aliases.
Follow-up dpl_85ytGDQaPtGoEaiXVhdhUpNhSXwa failed at its canary; never promoted.
Source1f1d7cb8ac18084fab457bf669c2749275baf262 deployment
dpl_FgtNm9kHbu5QpueRUiHn7KUAvLi5 READY/promoted; both backend aliases verified,
health200, Next compile/TypeScript/build PASS,798provider-boundary modules0violations,
82migrations with none pending. Nonfatal Next/Prisma tracing warning retained.
Android11 build4adc3efc-a261-41ea-919f-6c75c6b9048d is INTERNAL/founder-device,
sourcea0a65115bae1d0df806b921383bc564d7d061756; FINISHED2026-09-12T17:57:27Z.
Official apksigner verifies v2 signature/single unchanged signer; aapt confirms
ai.endvera.mobile/versionCode11/versionName0.2.1/minSDK24/targetSDK36.
APK SHA2567af768668ab97a9ebd5a2ef60c01b5b3cd1b75a7ef58c5cece82a1cb36e49eeb;
signer SHA256ccdd90c46c734e3f97a8d1bc4344b8f10ea0537788f13d1d890c812bc8a5bc1b.
Download https://expo.dev/artifacts/eas/qxQ_EN-5apHucvMe6gwJSLXy41N9ytBurMgrNmGPrvs.apk
expires2026-09-26T17:43:15.005Z. No observed Samsung install or calendar write.
Follow-up e3e263c21809be048b0f7203348ff139a0b624e8 deployment
dpl_CqHz7phposxinCjep5zUmp6KJzwa READY; full-calendar canary failed validation.
Diagnostic sourcec47da7972ab3f40e5e63a39befbb38f2661075fc deployment
dpl_G2jmMjN8moWPX4LNCG66J9f2KQcP READY with successful r3 candidate inspection.
Final functional source9400fe79aaec2cc9e09aaa9b08a40144f586afc8 deployment
dpl_ALTpihWaEZxBbGfzKAbSSQmm2xWU READY/promoted. Build had no canary flag,
no provider call, no SMS and no pending migration;798 boundary modules0violations,
Next compile/TypeScript/build PASS. Only nonfatal pre-existing NFT warning.

No Samsung calendar-write observation, closed-app wakeup proof or fresh full
SMS->model->delivered-answer observation in this repair. General adapter success
and a separate SMS probe are NOT equivalent to full E2E. Direct current weather
research is not configured; reviewed Exa disclosure/current owner search scope
remain prerequisites. Ambiguous temporal two-message correlated execution still
has a Google-only approval gate; do not present it as Android-complete.
Safe next device step: install Android11, open Assistant -> phone access ->
Examiner les permissions restantes. Success must explicitly name the chosen
calendar and say the phone is associated. Do not ask to enter another provider
key or repeat pairing. Device installation/consent cannot be completed from here.

Historical roadmap22%, local-build46.75%, C2 preparation18/18 unchanged and NOT
remeasured. Controlled owner-pilot tests only; global customer readiness NO-GO.
Verified-E2E percentage not recalculated or promoted from these partial probes.

## Sources inspected live

- https://www.twilio.com/en-us/sms/pricing/ca
- https://www.twilio.com/en-us/voice/pricing/ca
- https://openrouter.ai/api/v1/models/openai/gpt-5.6-luna/endpoints
- https://developers.openai.com/api/docs/models/gpt-5.6-luna
- https://openrouter.ai/docs/guides/features/plugins/web-search

Diagnostics use coarse codes, hashes and provider IDs, never secrets, phone
numbers, pairing tokens or full private model responses. I/O logging stays off.
