# R25 Research

## Official technical sources checked 2026-09-02

- Twilio Voice webhooks: https://www.twilio.com/docs/usage/webhooks/voice-webhooks
- Twilio Call resource: https://www.twilio.com/docs/voice/api/call-resource
- Expo Audio SDK: https://docs.expo.dev/versions/latest/sdk/audio/
- CRTC key unsolicited-telecommunications rules:
  https://crtc.gc.ca/eng/phone/telemarketing/tobligations/rules-regles.htm
- CRTC Unsolicited Telecommunications Rules:
  https://crtc.gc.ca/eng/trules-reglest.htm
- FCC declaratory ruling on AI-generated/artificial voice calls:
  https://docs.fcc.gov/public/attachments/FCC-24-17A1_Rcd.pdf

## Decisions

1. Provider callbacks are asynchronous and may repeat or arrive out of order;
   R25 therefore models immutable events plus monotonic canonical state.
2. Recording availability is distinct from call completion; transcript and
   recording proof are separate.
3. Expo recommends `expo-audio` for current cross-platform recording. R25 uses
   foreground-only recording, explicit microphone permission and a bounded
   local file. Background recording remains disabled.
4. Canadian automatic-dialing/announcing rules make express consent and proof
   material for solicitation calls. R25 therefore treats commercial automated
   calls as prohibited without separate future legal/operational authority.
5. US regulators also treat AI-generated voices as artificial/prerecorded voice
   for consent purposes. The product policy must be jurisdiction-aware before
   any real automated voice launch.

This research informs product guardrails; it is not a legal-compliance finding.
Jurisdictional legal review remains mandatory before provider activation.
