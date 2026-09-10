# Native audio probe — independent bounded review

Date: 2026-09-10. Scope: `probe-local-audio.ts`, `voice/pcm-segments.ts`, and the native segmentation plan. Reviewer did not import or execute the runner, FFmpeg, ffprobe, or any provider.

Verdict: GREEN for the proposed fixed synthetic local experiment, not for an untrusted-media service or a production process sandbox.

- One bounded path finding was corrected before execution: validate the real evidence parent and both newly created directories, as well as the repository and scratch parent, before writes. The reviewer reread the correction. These checks are not protection against a concurrent filesystem attacker.
- Exact executable digest pins, fixed generated 600-second sine input, closed invocation argument, explicit executable paths, shell disabled, hidden windows, child-only environment, bounded process time/output, and disabled MOV external references were inspected statically.
- PCM regression tests exercise exact sample preservation, boundary sizes, signed sample patterns, byte detachment, contiguous ordinals/sample indices, WAV payload/hash integrity, and rejection of empty, odd, or oversized PCM. Segmentation does not establish media source derivation.
- Fresh independent run: 25/25 tests across `native-audio-probe-review.test.ts` (13) and `voice-pcm-segments.test.ts` (12), 04:21 local runtime clock. Scoped ESLint passed.

No native decoder, native cleanup behavior, publisher authentication, OS isolation, real recording, provider call, or end-to-end user outcome is proved by this review. Native execution and evidence remain parent-owned. The prior test worker OOM caused by deep Buffer assertions remains separate historical test-harness evidence, not a successful native run.
