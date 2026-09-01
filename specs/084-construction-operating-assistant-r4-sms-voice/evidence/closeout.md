# R4 closeout — local SMS and voice adapters

## Result

`LOCAL_SMS_AND_CONSENTED_VOICE_ADAPTERS_READY_NO_EXTERNAL_TRANSPORT`

R4 connects strict local SMS events and consented finalized voice transcripts
to the shared Construction Operating Assistant engine. It separates exact
outbound approval from an SMS dispatch plan that remains
`PREPARED_UNSENT`.

## RED found and resolved

1. The R3 PostgreSQL provider, grant and operation constraints initially
   refused the new provider-neutral channels. A forward-only R4 migration now
   expands only those allow-lists.
2. An opaque identity hash initially included unexpected runtime properties.
   Hash inputs are now projected field by field.
3. Concurrent delivery of the same authenticated local event exposed the
   limited local PostgreSQL proxy pool. In-process retries now share one
   in-flight operation, while the persisted command key, unique indexes and
   advisory transaction lock remain the cross-process and restart boundary.

## Observed validation

- R4 pure contracts plus R2 connector truth: 11 tests passed.
- R0/R2/R3/R4 disposable PostgreSQL: 4 files, 21 tests passed.
- Full unit suite: 89 files passed, 2 skipped; 1,223 tests passed, 2 skipped.
- PostgreSQL migration chain: 38 forward migrations applied from empty.
- Prisma schema validation: passed against the disposable database.
- ESLint: passed with zero warnings.
- TypeScript: passed.
- Next.js Webpack build: passed, 104/104 static pages generated.
- `package-lock.json`: unchanged (`f0663f30d007cb2664f7944749cfb0cc12849fd8`).
- `git diff --check`: passed.

## Authority boundary

- No real phone number is required or admitted by the R4 adapter contract.
- No provider, public webhook, credential, OAuth token or external network was
  used.
- No SMS or call was sent; every recorded operation has
  `externalTransportPerformed=false`.
- Voice admission requires consent evidence and stores no source audio.
- Customer data, push, Preview, Production and deployment remain out of scope.
