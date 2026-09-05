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
- Historical R37 report SHA-256 values remain unchanged:
  - original: `bc79e1416f82ff08665690b0140471111ce00abb0a026419bb503688b6797eb3`
  - corrected: `0f94e15c69c32fc1ac7c2162ce0460ea93c6cc581864826d46879dd160ac5649`

## Environment-only build limitation

The webpack production-shaped build compiled successfully and completed TypeScript, but the first page-data pass correctly refused a missing build-only auth secret. After supplying a synthetic local secret, the second run stopped with `ENOSPC` because C: had insufficient free space. Generated `.next` output was removed and no source artifact was lost. This is recorded as an environment limitation; T011 remains open until a complete build can run with adequate disk.

## Human evidence state

`founder-observation.json` does not exist. No founder result, PASS, customer value, provider execution or production readiness is claimed. The next valid event is Olivier opening the direct one-time local surface and completing exactly one session.
