# Local native audio segmentation — synthetic proof only

2026-09-10. Continues the personal-service campaign without enabling a provider.

The workstation already has FFmpeg/ffprobe8.1.1 in its WinGet Gyan package. The
executables are locally hashed and Authenticode NotSigned; this is not publisher
authentication, vulnerability clearance or a production decoder certification.
No install, distribution of GPL binaries or real/personal audio is authorized by
this probe. Existing Project Brain manifest remains SYNTHETIC_LOCAL and does not
gain mediaDecodingVerified from a passed unit test.

1. Implement a pure bounded PCM16LE mono16kHz-to-WAV segmenter. Preserve every
   decoded sample; at most45seconds/segment,600seconds/session,14segments,2MB per
   segment,28MB total. Keep sample indices as primary timing; do not silently
   truncate, pad or pretend fractional milliseconds are exact integer timing.
2. Use only a fixed synthetic600s sinusoid generated locally as an AAC/M4A file
   by the pinned executable. Decode the complete file to bounded raw PCM, then
   split and validate WAV headers/coverage/hashes with local ffprobe. A duration
   or size mismatch is a retained failure, not a reason to shorten the fixture.
3. Explicit executable paths/hashes, shell:false, windowsHide:true, narrow clean
   environment, owned create-new scratch, stdout/stderr bounds, timeout and child
   exit checks. File/pipe protocol whitelist and disabled external MOV tracks.
   These controls are not an OS sandbox or a total-process-memory limit. No
   arbitrary user path, URL, filtergraph, filename or input audio is accepted.
4. Unit-test PCM boundaries, exact reassembly, non-mutating detached output and
   fractions. Peer-review the runner before executing its fixed native fixture.
5. Record results and owned artifacts. No gateway session/consent, transcription,
   model inference, facts, external audio or production execution follows.

Primary references checked today: https://ffmpeg.org/ffmpeg.html,
https://ffmpeg.org/ffmpeg-formats.html#mov_002fmp4_002f3gp,
https://ffmpeg.org/ffmpeg-protocols.html and https://ffmpeg.org/ffprobe.html.
The MOV demuxer's enable_drefs/use_absolute_path remain disabled. max_alloc
limits an individual allocation, not total memory; runner wall timeout is
separate from FFmpeg's CPU timelimit. Future untrusted-media hosting needs a
separately reviewed isolation, retention and decoder/provenance contract.

Implementation check: the first PCM unit run exhausted the Vitest worker heap
while deeply comparing two 19.2MB Buffers (5 tests passed, one worker error).
The assertion now uses Buffer.equals for the same exact-byte comparison, without
raising the heap limit or changing the samples. Fresh rerun at04:19:23 local:
12/12 PASS,274ms. This was a test-comparison failure, not a native audio run.
Peer review also required realpath/reparse checks of the evidence parent and
both newly created artifact directories before any writes. These checks do not
claim protection against a concurrent privileged filesystem attacker.

Observed local outcome: evidence/audio-probe-4a5ac2ed-74e9-409f-a29e-6468bd239f6a/result.json,
2026-09-10T08:22:51.714Z, SYNTHETIC_NATIVE_DECODE_AND_SEGMENT_PASS. All18 native
stages exited0;3759037-byte AAC/M4A source,600seconds,9600000samples,14 WAV files.
Both complete decodes and exact PCM reassembly agree. This result does not alter
the SYNTHETIC_LOCAL manifest claim, enable a decoder endpoint, or prove ASR.
