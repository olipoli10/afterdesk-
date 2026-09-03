# R36G closeout — Signable mobile build preparation

## Verdict

`READY_FOR_SIGNING_AUTHORITY` — `CODE + TEST`, not signed, uploaded, submitted, published, deployed or provider-observed.

## Delivered

- Credential-free `apps/mobile/eas.json` beside the Expo monorepo app.
- Exact `local-simulator`, `internal-preview` and `store-candidate` profiles.
- iOS identity `ai.endvera.mobile`, build `1`, target artifact `IPA`.
- Android identity `ai.endvera.mobile`, version code `1`, target artifact `AAB`.
- Six explicit external inputs with owner class and evidence requirement, no values.
- Pure validators with no child process, network, EAS, signing, upload or submit path.

## RED

Before implementation, both targeted suites failed because `apps/mobile/eas.json` did not exist. Mutation coverage then proved refusal of submit configuration, hidden value material, unexpected profiles, identity drift and readiness inflation.

## Validation

- Mobile R36G: 5/5 tests passed.
- Root R36G plus R35 regression: 11/11 tests passed.
- Mobile typecheck: passed.
- Mobile lint: passed.
- Local readiness command: `READY_FOR_SIGNING_AUTHORITY externalEffectCount=0`.
- Lockfiles: unchanged.
- External effects: 0.

## External blockers retained

Expo ownership, Apple membership/signing, Google Play account/signing and a public HTTPS API origin remain exact later-authority requirements. No account or credential was accessed.

## Source fingerprint

- Implementation commit: `f96804c13b6370851dee198c7787e808ea546a38`
- Tree: `80f992efce2e3cf32c2ee4da7b6e5bd3116b192c`
