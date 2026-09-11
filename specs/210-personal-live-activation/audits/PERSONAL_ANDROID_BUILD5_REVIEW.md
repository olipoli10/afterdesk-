# Android founder build 5 — independent source review

Reviewed 2026-09-11 01:04 UTC by the independent openrouter_disabled_adapter lane in `C:/dev/endvera-astra-r03`.

## Verdict

GREEN, bounded to the local source/configuration delta. No concrete blocking defect found. This review does not certify an EAS build, remote environment, signature, installed APK, backend availability, or provider/customer workflow. No network, EAS, backend, credential, database, commit, or deployment action was performed by this reviewer.

## Reviewed changes

- Android versionCode moves from 4 to 5 consistently in app.json, runtime release metadata, release-definition-v3 and mobile-build-readiness. Semantic version stays 0.2.0; iOS build 1, package, scheme and EAS project identity remain unchanged.
- Only the founder-device profile receives `EXPO_PUBLIC_ENDVERA_API_URL=https://endvera-core-sandbox-afterdesk.vercel.app`. Internal distribution, APK output, autoIncrement false, local version source and requireCommit remain unchanged. Existing runtime consumers use this exact variable name.
- The necessary store-build validator exception is limited to the exact `build/founder-device/env` location, one exact key and one exact URL. Other profiles, nested env, additional token material and alternative origins remain refused. No blanket env/secret allowance was introduced.
- Current projection changes only the two source hashes and Android code. The existing builder, not a new serializer, validates it. Its evidence remains STATIC_SOURCE_CONFIGURATION_ONLY, with no observed proof and provider/customer NO-GO.
- Read all affected test diffs. Negative identity mutations now use 6 or 99 instead of the newly valid 5. Missing env remains a genuine deletion mutation; it no longer incorrectly assumes the current source omits env. Rendered diagnostic expectations now match Android 5. No assertion was skipped or relaxed into an arbitrary version/origin acceptance.

## Fresh reviewer checks

At 2026-09-11T01:04:26.028Z:

- `readCurrentProjection()` PASS against the actual source bytes; semantic 0.2.0 / iOS 1 / Android 5, five exact current inputs.
- Existing `validate-endvera-mobile-build-readiness.mjs` PASS (`READY_FOR_SIGNING_AUTHORITY externalEffectCount=0`). This is a local validator label, not release authorization.
- `git diff --exit-code` PASS for current-projection-v3.history.json, the three archived whole-product/market artifacts, and original release-definition.json. The builder also verifies the fixed archive anchor and archived byte hashes.

At 21:04:38 local (2026-09-11 01:04 UTC), safeEnvironment focused rerun: **32/32 PASS**, 2 files, exit 0:

- personal-founder-android-build-inputs-review.test.ts: 13.
- unit/release-source-security-review.test.ts: 19.

No duplicate global TypeScript/root/native/build run was launched. No additional countertest framework was needed: existing negative cases exercised the changed version/env boundaries and source metadata mutations.

## Author evidence, separately attributed

Author reports root targeted 104/104 at 21:00:49, mobile release/store 11/11 at 21:01:02, mobile TypeScript and scoped lint exit 0, then full mobile 770/770 at 21:02:30 in `evidence/mobile-1789088542037`. These counts are not relabelled independent reviewer runs.

Preserved author-reported intermediate failures: old store-build validator rejected the newly authorized founder env (1 PASS / 1 FAIL, 20:59:28); old rendered Android 4 expectation caused full mobile 769 PASS / 1 FAIL at 21:02:08 before the expectation was updated to 5. No additional product defect or historical RED is claimed by this review.

## Reviewed source SHA-256

| File | SHA-256 |
| --- | --- |
| apps/mobile/app.json | b26865bac19095885ea629f5b726c1cc4b03fc9752d25fc9531df7761340a53e |
| apps/mobile/eas.json | 645c5f2bbce462b25e1bd04bf2fbe5ee7f94a3c5d2b166fec03422c4eef3ff2c |
| apps/mobile/src/lib/release.ts | 1e84b1141fbcc962e0dd94812a77029850dca0f213e891c8e5754b17d3f7753d |
| apps/mobile/src/lib/store-build.ts | 69bdfbb80143a22a28139063d31838a9401a31dac9fd35dae526e1d26fc446c0 |
| release/endvera-construction-v1/release-definition-v3.json | 8de0104a4c06e37dc3602eb1318003908589ff046fa352d85fe90141c40218a2 |
| release/endvera-construction-v1/mobile-build-readiness.json | bbba13411989dd38aa482f5af0630d129bdf1d00e534bed6f004147bb8542d23 |
| release/current-projection-v3.json | 5d7e8e5950daa85c3dedf13a7b221a508b3ce3892653aacda787daf55541ff57 |

## Boundaries

Parent-reported latest EAS code4 FINISHED and backend source8d462 READY were not independently queried here. Source env does not prove remote EAS variables cannot override it; the existing founder guard and controller-owned build checks remain applicable. This review contributes a code/configuration gate only, not roadmap completion or new Verified-E2E coverage. Existing unrelated tsconfig/drafts were left untouched. Reviewer wrote only this audit.
