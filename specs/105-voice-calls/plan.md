# Implementation Plan: R25 Voice Calls and Voice Notes

## Architecture

1. Extend R4 voice contracts with R25 disclosure/consent and lifecycle schemas.
2. Add forward-only PostgreSQL call-session, transition, voice-note-reference
   and prepared-call-work tables.
3. Add trusted transcript admission that resolves identity/project and routes
   exactly once through R18.
4. Add selected local voice-note admission with no fabricated transcription.
5. Add policy-bound outbound call-work preparation and optional R22 escalation.
6. Add protected mobile API and one shared Calls & voice surface.
7. Add foreground-only `expo-audio` capture with explicit permission, 120-second
   maximum and explicit submission.
8. Prove replay, concurrency, restart, ambiguity, consent and role isolation on
   disposable PostgreSQL and shared mobile tests.

## Safety gates

- no provider adapter execution or public webhook;
- no background recording or silent microphone use;
- no raw phone, temporary device URI or provider audio URL in canonical rows;
- no transcript/fact without an admitted proof level;
- commercial automated calls prohibited by default;
- exact disclosure and policy version before outbound work preparation;
- no external call, transport or write.

## Validation

- R25 and relevant R4/R18/R22 unit/integration tests;
- full shared mobile suite, typecheck, lint, Expo doctor and local all-platform export;
- Prisma format/validate/generate, fresh 52+ migration rebuild and current status;
- root lint/typecheck and Next.js Webpack build;
- lockfile review, `git diff --check`, no provider/network/customer data.
