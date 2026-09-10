# LONG_DICTATION_LOCAL_600S — local recording, not transcription

Proposed queue entry: `LONG_DICTATION_LOCAL_600S`. Parent owns campaign queue/checkpoints.

1. Keep one Project Brain voice source, 10 MiB maximum, AAC/M4A; raise capture/mobile/backend/actual-container duration limits together to 600 seconds. Use installed Expo 57.0.4 recording options: mono 64 kbit/s, document directory, Android size cap. No background permissions or recording.
2. Before recording, persist a bounded exact owner/workspace/project/intake/version/command/recorder/URI journal. Distinguish interrupted recording from confirmed native completion. Prevent accidental navigation; stop on background/context departure. Never infer a complete recording after process death.
3. Confirmed recordings enter the existing durable source queue only through an explicit user action. Recoverable journal states never auto-upload; expired context/owner refuses. Existing command identity, uncertain-response replay and canonical-receipt cleanup remain unchanged. Incomplete audio is retained as interrupted evidence, not imported as valid audio.
4. Bound this multipart upload separately: mobile 120 seconds; server body read 60 seconds, signal-aware and size-limited. Preserve 10 MiB + 128 KiB envelope and two admissions/user. No global timeout increase or claim that client cancellation reverses a committed upload.
5. Test duration/byte boundaries, malformed M4A, exact journal context, interruption/stale callbacks, failed persistence, no automatic upload, unknown replay and multipart abort/deadline. Peer review before checkpoint.

No ASR/model/provider requests, spending, deployment, APK build, new migration or native background capability. A killed process can leave incomplete M4A; no lossless-recovery or Samsung-observed claim. The separate transcription branch stays disabled and is not this deliverable.

Journal scope: the current foreground app has one JavaScript runtime; Promise serialization is not an atomic interprocess SecureStore CAS. No headless/background/multi-runtime recording is supported. Interrupted recordings are not resumable audio. Cleanup intent is persisted before file deletion, so a failed SecureStore deletion can retry cleanup only, without rereading or uploading the audio.

Storage-failure boundary: a known native invalidation whose journal write fails closes the current screen's Continue control. On a subsequent load, both RECORDING and not-yet-STAGED STOP_CONFIRMED become INTERRUPTED; the file is retained but not imported, even if the prior stop appeared successful. This intentionally sacrifices recovery of an unstaged completion rather than reconstructing an unrecorded native proof. STAGED retains the exact already-validated command and uncertain-outcome replay; CLEANUP_PENDING only resumes deletion. There is no lossless crash-recovery guarantee.
