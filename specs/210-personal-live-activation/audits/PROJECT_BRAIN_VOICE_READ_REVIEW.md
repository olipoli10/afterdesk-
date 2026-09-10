# Project Brain voice metadata projection — independent review

2026-09-10. Reviewed the complete additive `readProjectBrainVoiceSession`, `inspectStoredProjectBrainVoiceManifest`, and author read tests. No production edits or native PostgreSQL execution by reviewer.

Verdict: GREEN for bounded local metadata read validation; no actionable critical defect identified.

The parsed request separates trusted caller actor/context from recorded subject data. The exact owner/workspace/session joined query holds current source, file, intake, member, workspace and project rows; transaction-scoped source reinspection compares the immutable fingerprint. Recorded binding/manifest hashes and strict shapes are checked, as are all registered segment identities and metadata against the ordered manifest. Database clock is checked after the reads, and a transaction failure is not converted into a returned projection or retry.

Returned objects contain bounded, frozen metadata and false execution/transcription/decoder/provider-cost authority flags. No raw bytes, protected storage coordinates, file ID, transcript text or usable transcript claim is returned, including when the recorded session says ready and segments say succeeded. Current owner revocation/purge is not bypassed by old consent.

Fresh reviewer rerun of author tests: 89/89 PASS (35 read, 27 sessions, 27 source segments), 04:40 local runtime clock. This is a source review and rerun of author tests, not 89 newly independent cases or a new database proof. Native current-authority/locking validation remains parent-owned.
