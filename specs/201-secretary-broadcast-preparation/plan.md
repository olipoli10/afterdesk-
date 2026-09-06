# Plan: Secretary broadcast preparation

## Architecture

1. Add a pure closed-world group-command parser and canonical fingerprint contract.
2. Add a dedicated durable PostgreSQL broadcast-draft record rather than weakening the existing single-recipient action payload.
3. Intercept only valid multi-recipient assistant commands before the legacy single-recipient path.
4. Resolve every contact server-side under the verified workspace and snapshot an ordered exact audience.
5. Persist inbound message, draft, outbound assistant reply and audit atomically with request idempotency.
6. Project owner-visible exact names plus masked destinations; redact field-worker content.
7. Keep approval, provider dispatch and delivery outside this release.

## Files

- `prisma/schema.prisma` and one additive migration
- `src/lib/construction-operating-assistant-r38e/`
- `src/server/construction-operating-assistant-r38e/`
- `src/server/construction-operating-assistant-r36c/orchestrator.ts`
- `src/app/api/endvera/v1/mobile/secretary-broadcasts/route.ts`
- root and disposable-PostgreSQL tests

## Gates

- TDD RED then focused unit and integration PASS
- Exact restart, replay, 2/10/11 recipients, ambiguity, role and workspace evidence
- Full typecheck, lint and provider boundary
- Zero external effects and no readiness metric inflation
