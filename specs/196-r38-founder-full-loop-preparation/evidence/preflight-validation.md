# R38 local preflight validation

Date: 2026-09-05

## Passed

- RED was observed first: the R38 contract suite failed on the absent launcher and preflight validator.
- Contract/preflight suite: 7/7 passed.
- Disposable PostgreSQL whole-loop integration: 1/1 passed.
- Combined R38 suite: 8/8 passed.
- TypeScript: `tsc --noEmit` passed.
- Provider boundary: `R37O_PROVIDER_BOUNDARY_PASS modules=588 violations=0`.
- Static secret scan: clear.
- Spec preflight: `R38_FOUNDER_FULL_LOOP_PREFLIGHT_READY`.
- Local Next development server: ready on loopback with webpack; the Turbopack symlink path is deliberately avoided.
- Disposable R38 PostgreSQL and the loopback server are running; one short-lived, single-use direct-access URL is prepared for Olivier.
- Founder admission regression: the first real click exposed two local defects before `START` (the `/client` layout required normal portal authentication, and Next's configured canonical host changed `127.0.0.1` to `localhost`, dropping the host-only test cookie). Both were reproduced with failing tests and HTTP traces.
- Corrected admission: the isolated route now lives outside the authenticated client layout, trusts only the loopback host plus its one-time HTTP-only test cookie, preserves the request host on redirect, and rotates a pre-start admission token without creating a second founder session.
- Final HTTP proof: one throwaway token resolved with status 200 at `http://127.0.0.1:3038/founder-full-loop`, rendered the Laval founder surface and contained no login page. That proof token was consumed; the launcher then issued Olivier a distinct unconsumed token.
- First-action regression: Olivier's real `Commencer` submission was refused before mutation because React server actions add internal `$ACTION_*` entries and the strict R38 parser consumed the entire `FormData`. The visible refusal preserved `NOT_STARTED` and no human result was recorded.
- Corrected form contract: step and final-observation parsers now project only the explicit R38 allowlisted fields before strict validation. RED reproduced both failures; GREEN accepts React metadata without allowing any unknown client field into the business payload.
- Test-isolation regression: the PostgreSQL dry run left its synthetic canonical loop behind, so the first real `START` correctly refused what looked like a second session. The integration teardown now deletes only the fixed R38 synthetic workspace, and pre-start access preparation resets that same workspace before reseeding. Advanced or started human sessions remain fail-closed and cannot be reset.
- Historical R37 report SHA-256 values remain unchanged:
  - original: `bc79e1416f82ff08665690b0140471111ce00abb0a026419bb503688b6797eb3`
  - corrected: `0f94e15c69c32fc1ac7c2162ce0460ea93c6cc581864826d46879dd160ac5649`

## Environment-only build limitation

The webpack production-shaped build compiled successfully and completed TypeScript, but the first page-data pass correctly refused a missing build-only auth secret. After supplying a synthetic local secret, the second run stopped with `ENOSPC` because C: had insufficient free space. Generated `.next` output was removed and no source artifact was lost. This is recorded as an environment limitation; T011 remains open until a complete build can run with adequate disk.

## Human evidence state

`founder-observation.json` does not exist. No founder result, PASS, customer value, provider execution or production readiness is claimed. The next valid event is Olivier opening the direct one-time local surface and completing exactly one session.
