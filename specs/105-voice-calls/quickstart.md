# R25 Local Quickstart

1. Use only the campaign-owned disposable PostgreSQL clusters.
2. Record only synthetic local audio or use synthetic normalized transcripts.
3. Run R25 contract tests before PostgreSQL scenarios.
4. Verify no transcript appears for an untranscribed selected audio note.
5. Verify disclosure/consent, replay, ambiguity and field-worker redaction.
6. Export the shared app locally for iOS, Android and Web with
   `EXPO_PUBLIC_ENDVERA_API_URL=https://local.invalid`.

Expected result: local call/voice-note state and prepared work only. No phone
number, provider, real call, speech model or external transport.
