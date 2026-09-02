# Feature Specification: R25 Voice Calls and Voice Notes

**Feature Branch**: `codex/endvera-construction-operating-assistant-r10-r12-autonomous`  
**Created**: 2026-09-02  
**Status**: In progress  
**Input**: R25 of the canonical ENDVERA Construction Operating Assistant roadmap.

## Product outcome

ENDVERA accepts a short voice note or a normalized inbound-call transcript as
another way to talk to the same operating assistant. It maintains one durable,
project-bound call record, asks for clarification when identity/project intent
is ambiguous, preserves disclosure and recording-consent facts, and prepares
bounded outbound call work without dialing anyone.

R25 extends the existing R4 provider-neutral voice transcript contract and R18
intent router. It MUST NOT create a second assistant, transcript database or
provider-specific call engine.

## User scenarios and acceptance

### US1 — Leave a bounded voice note

An authorized owner, office user or field worker records a foreground-only
voice note in the shared iOS/Android app. The app shows duration, local state
and project target before explicit submission. The selected file is admitted
through the existing secured evidence path. With no authorized transcription
provider, it remains `TRANSCRIPTION_PREPARED`; no invented transcript or intent
is created.

### US2 — Resume from a trusted call transcript

A trusted disabled adapter supplies an opaque caller reference, call identity,
disclosure state, recording-consent state and normalized transcript. ENDVERA
binds it to one workspace/contact/project, records it once and passes the
transcript through R18. Replay has exactly one canonical effect. Ambiguity
creates clarification state and no consequential project write.

### US3 — Prepare an outbound call task

An owner or office user selects an exact contact, purpose, disclosure script,
call objective and result schema. ENDVERA verifies the contact-specific call
policy and creates either a provider-neutral `PREPARED_UNSENT` call operation
or a bounded Human Work Unit. R25 never dials, synthesizes speech or writes to a
provider.

### US4 — Inspect calls safely

Owners and office users see call purpose, disclosure/consent, transcript proof
level, project, next owner and prepared status. Field workers see only their own
authorized voice notes and minimized task status; client/financial call bodies,
phone numbers and unrestricted transcripts remain absent.

## Functional requirements

- **FR-001**: Reuse R4 trusted voice transcript envelopes and R18 intent routing.
- **FR-002**: Persist call sessions, immutable transitions and selected voice-note references in PostgreSQL.
- **FR-003**: Require opaque identity, adapter authenticity, workspace membership and exact replay identity.
- **FR-004**: Separate service, commercial/telemarketing, recording and transcription consent.
- **FR-005**: Record disclosure version and acknowledgment before any transcript is treated as call evidence.
- **FR-006**: Never infer consent from silence, call completion or transcript content.
- **FR-007**: Preserve transcript proof level: `SYNTHETIC_LOCAL`, `HUMAN_TRANSCRIBED` or future `PROVIDER_OBSERVED` only.
- **FR-008**: A selected audio file without authorized transcription remains untranscribed and cannot produce facts.
- **FR-009**: Bound voice notes to a maximum duration and size; recording is foreground-only by default.
- **FR-010**: Route one transcript to one project or ask for clarification without a consequential write.
- **FR-011**: Prepare outbound call work only after exact contact, purpose, policy, disclosure and result-schema inspection.
- **FR-012**: Keep provider execution, synthetic voice, dialing and external transport disabled.
- **FR-013**: Maintain monotonic call lifecycle and idempotent callbacks without overwriting contradictions.
- **FR-014**: Keep raw phone, source audio URL, provider token and broad transcript detail out of field-worker projections.
- **FR-015**: Recover mobile recording/submission commands without automatic upload or call.

## Success criteria

- 100% exact replay with one canonical call/session effect.
- 0 project writes from ambiguous identity or project context.
- 0 invented transcript, consent, disclosure or call result.
- 0 raw phone/provider secret in new persistence or field projections.
- 0 external call, provider request, synthesized speech or transport.
- Identical call state after process restart.
- iOS and Android share one foreground voice-note and call cockpit implementation.

## Out of scope

- real Twilio or carrier account;
- public webhook, SIP, phone number or OAuth;
- real speech-to-text/text-to-speech;
- autonomous AI robocall or predictive dialer;
- background microphone recording;
- customer/prospect data;
- push, Preview, Production, EAS or app-store action.
