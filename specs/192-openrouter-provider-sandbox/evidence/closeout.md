# R37 observed provider closeout

- Completed at: `2026-09-04T23:30:00Z`
- Verdict: `REWORK`
- Campaign: `r37-openrouter-0f386ce5-7fcd-4f2a-afcd-902bbf03009a`
- Evidence label: `OBSERVED_PROVIDER_SYNTHETIC_INPUT`
- Sealed report SHA-256: `bc79e1416f82ff08665690b0140471111ce00abb0a026419bb503688b6797eb3`

## Observed result

- Expected matrix: 6 exact model-case pairs.
- Dispatched attempts: 1.
- Canonical observations: 0.
- Failure: `R37_PROVIDER_HTTP_404`.
- Provider-reported settled spend: 0 micro-USD.
- Selected R38 candidate: none.
- Retry: none. The observed result is preserved as `REWORK`.

## Safety and cleanup

- Inputs were synthetic only.
- Credential value was never inspected, printed, persisted or committed by ENDVERA.
- Repository secret-pattern scan found zero matching files.
- Campaign grants were revoked.
- Provider lane was disabled.
- External communication, external tool writes and deployment were all false.
- The disposable R37 Prisma development server and PostgreSQL database were removed.
- Report-only validation returned `R37_STATE=REWORK`, `R37_REPORT_ONLY=true`, `R37_NETWORK_CALLS=0`.

## Post-observation validation

- Targeted R37 unit validation: 3 files, 19 tests passed.
- R37 disposable PostgreSQL integration: 1 file, 3 tests passed after all 66 migrations; the owned database and server were removed.
- Provider-boundary gate: 581 modules, 0 violations.
- Lint: 0 errors, 1 pre-existing unused-variable warning outside R37.
- TypeScript typecheck: passed.
- Serialized full unit suite: 226 files passed, 2 skipped; 2,384 tests passed, 2 skipped.
- Long-run manifest: 4 chapters complete, 285 estimated minutes, `VERDICT=COMPLETE`.
- Local continuation queue: 106 of 106 entries done; R37 observed queue: 1 of 1 entry done; both returned `VERDICT=DRAINED`.

## Adjudication

The first exact request did not produce an eligible OpenRouter response under the frozen model/privacy contract. The evidence proves fail-closed behavior and cleanup, not model quality or provider readiness. A new model-eligibility packet and separately authorized retest are required before another provider attempt.
