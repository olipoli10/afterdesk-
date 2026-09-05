# R37BC Local Contract Alignment Closeout

**Date**: 2026-09-05

**Verdict**: `LOCAL_CONTROLLER_CONTRACT_ALIGNMENT_READY`

## Corrected

- The original `INVOICE_READINESS` case remains frozen at version 1 with `CLARIFY` only.
- A new version-2 case permits `ANSWER_FROM_STATE` plus `CLARIFY`, matching the requested state decision.
- Corrected requests now expose exact `allowedCapabilities` and `expectedLimitations` from the validated case.
- Answer-term and forbidden-term oracle internals remain hidden.

## Evidence

- RED: 5 expected failures reproduced the capability mismatch, three hidden-contract failures and an initially mis-targeted historical hash guard.
- GREEN focused: 5/5 tests passed.
- R37 regression set: 21/21 tests passed.
- Full unit suite: 2395 passed, 2 skipped; 229 files passed, 2 skipped.
- TypeScript typecheck: PASS.
- Focused lint: PASS with zero warnings.
- Full lint: PASS with one pre-existing warning in `src/lib/construction-operating-assistant-r34/registry.ts`.
- Provider boundary: `R37O_PROVIDER_BOUNDARY_PASS modules=583 violations=0`.
- Corrected report validator: `R37_CORRECTED_REPORT_VALID=true`, `R37_CORRECTED_NETWORK_CALLS=0`.
- Webpack compilation and TypeScript stage passed; page-data collection then refused safely because real R2 production credentials were intentionally absent. The default Turbopack path also refused the existing out-of-root `node_modules` junction. No credential was added to bypass either guard.

## Immutable observations

- Original R37 report SHA-256: `bc79e1416f82ff08665690b0140471111ce00abb0a026419bb503688b6797eb3`.
- Corrected-retest report SHA-256: `0f94e15c69c32fc1ac7c2162ce0460ea93c6cc581864826d46879dd160ac5649`.
- Both stored verdicts remain `REWORK`.
- The corrected-retest reason codes remain `R37_CAPABILITY_NOT_ALLOWED_FOR_CASE` and `R37_REQUIRED_LIMITATION_MISSING` because that is what the paid run actually observed.

## Boundaries

- Additional provider calls: 0.
- Additional provider spend: 0.
- Credential access: 0.
- Customer/prospect data: 0.
- External communication or write: 0.
- Push, Preview, Production or deployment: 0.

## Readiness

This is local `CODE + TEST` evidence only. It does not convert R37 to PASS, select a provider model, authorize another retest, authorize R38, or increase Verified-E2E coverage.

