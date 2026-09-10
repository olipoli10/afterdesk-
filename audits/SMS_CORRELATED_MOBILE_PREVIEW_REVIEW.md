# Unwired mobile correlated preview — bounded cross-review

2026-09-10. Read the full new helper, author test file, mobile contract and updated
SMS_CORRELATED_MOBILE_REVIEW_PLAN; traced the reused personalCalendarDisplay.
Engineering code-review skill applied. Reviewer owns only the separate
apps/mobile/test/personal-correlated-calendar-preview-review.test.ts and this
audit. No source/UI/API/DB/provider/device/global-root test changes or execution.

## Verdict

GREEN for the local presentation-only contract. No additional actionable defect
reproduced. The parent's stricter reply timestamp finding was fixed by the author
before the review run: answer.receivedAt must be strictly after original, not
equal. Reviewer independently exercises equality and the preceding millisecond;
this is regression evidence, not a newly observed reviewer RED.

The strict versioned envelope rejects extra actionable fields at every modeled
level, requires two ordered distinct identities, binds citations to source IDs
and declared hashes, uses exact UTF16 slicing and refuses splitting a surrogate
pair at either boundary. The title keeps the existing trim-only transformation.
No Unicode NFC/code-point conversion changes supplied text or citation positions.
This does not certify grapheme completeness, linguistic meaning or source origin.

Canonical UTC millisecond strings must round-trip exactly, and the event interval
must be increasing. The original anchor is retained. The formatter receives the
explicit named zone; unavailable formatting retains raw evidence without enabling
approval. It does not calculate a new event from the SMS or the phone timezone.

Zod supplies parsed copies, and all returned nested evidence/display structures
are recursively frozen. Callers cannot mutate retained input references to alter
the returned preview, and even invalid output is a frozen no-evidence refusal.
No action IDs, execution request, network callback or approval authority appears.

## Eighteen new reviewer cases

Fresh11:55:09 **85/85 PASS**:44 author preview +18 reviewer +23 formatter cases.
Mobile TypeScript and scoped reviewer ESLint pass afterward.

Counter-tests cover two supplementary characters plus ZWJ/decomposed accent;
rejection of NFC-substituted quote; both internal surrogate boundaries; reply-side
surrogate cut; code-point instead of UTF16 offset; equal/earlier reply; alternate
offset/normalized midnight/leap-second/nonexistent date; recursively frozen
private copies; nested actionable fields; and exact fractional display instants.

Two deliberate negative-authority controls are important: consistent invented
hashes and a declared SYNTHETIC_LOCAL label can pass structural checking, but
sourceAuthenticityVerified/hashCryptographicallyVerified remain false. A draft
whose year disagrees with the words can also be structurally represented, with
semanticInterpretationVerified:false and approvalAvailable:false. That is the
documented boundary, not a failed calendar resolver: this utility is not one.

The source inventory search found no production import of the helper. The
updated mobile plan explicitly keeps the first card read-only/no button and
uses "pas encore ajouté" only for current pending state. Future typed-server
projection and actual integration require their own provenance/current-access
review; this local envelope must not be cast as an authenticated backend DTO.

No UI rendering, lifecycle, network, Expo/Samsung or cryptographic verification
was tested here. These pure tests add local presentation readiness only. All
execution and authenticity markers remain false; no provider GO follows.
Same-model cross-review is not independent model-quality validation.
