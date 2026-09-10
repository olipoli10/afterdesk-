# Personal auth refusal cache headers — peer review

2026-09-10. Read the complete helper, its exact three-line diff, the real personal phone route, the author's seven tests and the installed Next route-handler guide. The production delta adds only `cache-control: private, no-store` to the existing 401, wrong-origin403 and rate-limit429 responses. Principal checks, origin policy, rate key/window/limit, message bodies and successful principal return are unchanged.

New `test/personal-api-auth-cache-review.test.ts` imports the **actual phone route and actual auth helper**, mocking only authz and phone services. Ten cases verify 401/403/429 headers and bodies, refusal before body parsing/rate/effects where applicable, unchanged accepted web/native origins and identity, and unchanged successful phone-status response. The positive pairing calls are mock effects, not real pairing or SMS.

Author7 + reviewer10: **17/17 PASS at 17:48:41**. Scoped reviewer ESLint exit0. TypeScript pending at this entry. No production source or existing test was edited by the reviewer.

**GREEN, bounded to the three auth refusal branches.** These unit tests are not a deployed HTTP check, cache replay observation or evidence of a data leak. Route-local errors unrelated to `personalApiUser` are outside this tiny change; no claim is made that every personal endpoint response now has the same cache policy. Parent's original RED and remote header observation remain separate evidence. No DB/provider/phone service/network operation was performed by this reviewer.

Final root TypeScript no-emit check exited0. Reviewed helper SHA256: `b7dac232b47855461062fbe8c6c7874d252dd45b40018ba9562447f166123d81`. Tests and audit frozen; no source modification by reviewer.
