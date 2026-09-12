# Personal SMS answer — OpenRouter endpoint parameter fix

Observed on 2026-09-12 UTC. This is a bounded owner-only incident record. It
does not certify calendar, calls, employee messaging, research, or general
product readiness.

## Symptom and lineage

- A new owner SMS reached the Twilio webhook and created personal inbound,
  answer, gateway, decision, attempt, spend-hold, and outbound rows.
- The answer attempt ended `uncertain` with no provider request reference and
  no HTTP status. No automatic retry was launched.
- OpenRouter workspace logs showed no generation for the incident. The sealed
  key showed no generation usage.

## Bounded remote diagnosis

The production build diagnostic performed no inference and printed no secret.
It proved:

- connector encryption configuration valid;
- stored credential decrypts under its database binding;
- `GET https://openrouter.ai/api/v1/key` returned HTTP 200;
- model `openai/gpt-5.6-luna`, provider slug `openai`, output cap 512;
- provider boundary passed with 798 modules and zero violations.

OpenRouter's public endpoint metadata for `openai/gpt-5.6-luna` showed the
reviewed OpenAI endpoints advertise `max_tokens`, structured outputs and
`response_format`; the Azure endpoints advertise `max_completion_tokens`.
The request combined `provider.only=["openai"]`, `require_parameters=true`,
and `max_completion_tokens`. That combination excluded the pinned OpenAI
endpoint before inference.

## Correction

- The personal answer wire request now sends `max_tokens` while keeping the
  same 512-token ceiling, model allowlist, provider pin, ZDR/data controls,
  one-attempt rule, and budget reservation.
- `vercel.json` now binds production builds to the repository's versioned
  build pipeline, restoring the mandatory provider-boundary gate.
- A build-only opt-in diagnostic can validate decryption and key acceptance
  without printing credentials. It is not enabled in the final deployment.

## Verification

- Targeted tests: 71/71 passed.
- TypeScript: passed.
- Targeted ESLint: passed.
- Production provider boundary: 798 modules, zero violations.
- Database migrations: 82 found, none pending.
- Final production deployment: `dpl_J5Wamhdk8KSbdEikTwCg3c9maPxH`.
- Both `endvera-core-sandbox.vercel.app` and
  `endvera-core-sandbox-afterdesk.vercel.app` resolve to the final deployment.
- `/api/health`: HTTP 200.

## Remaining proof

No post-fix owner SMS has been observed yet. Successful OpenRouter generation
and delivery of an AI answer remain unverified until one new owner SMS is sent.
The failed source is not replayed. Verified-E2E for this answer path remains 0
until that observation exists.
