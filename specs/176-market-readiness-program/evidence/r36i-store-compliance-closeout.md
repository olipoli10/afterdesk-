# R36I — Store compliance and listing pack closeout

## Result

`READY_FOR_EXTERNAL_COMPLIANCE_INPUTS`

- Apple and Google use the same nine canonical data classes.
- iOS and Android disclose the exact microphone purpose present in `app.json`.
- French and English store claims have capability parity and meet Google's 80-character short-description ceiling.
- Apple privacy nutrition labels, Google Data safety, account deletion and screenshot requirements are captured as deterministic local workbooks.
- No screenshot was fabricated or uploaded. No store account, provider, credential or external action was used.

## Explicit remaining blockers

1. Active Apple developer account.
2. Active Google Play developer account.
3. Legal review of privacy disclosures and terms.
4. Functional public Web account-deletion request resource.
5. Real iOS and Android screenshots from an installable build.
6. Bounded store-review credentials and notes.

## Validation

- Targeted R36I tests: 7/7 PASS.
- R35/R36G/R36H/R36I combined root tests: 24/24 PASS.
- Mobile R36G regression: 5/5 PASS.
- Store compliance validator: `READY_FOR_EXTERNAL_COMPLIANCE_INPUTS`, 9 data classes, 2 locales, 6 planned scenes, 0 external effects.
- Root typecheck: PASS.
- Root lint: PASS with one pre-existing unused-variable warning in R34.
- `git diff --check`: PASS.
- Lockfiles, Prisma schema and migrations: unchanged.

## Source requirements checked

- Apple: privacy policy URL and App Privacy declarations are required; one to ten screenshots are accepted and an app preview is optional.
- Google Play: Data safety and a privacy policy are required; apps with account creation require both an in-app deletion path and a functional Web deletion resource; phone listing publication requires at least two screenshots and accepts up to eight per device type.

Implementation source: `4a2ba4860d37699649075bc8a0f782f8d1037c67` / tree `a9d4176a4225a572c772379c7e8bdbe7d020337e`.
