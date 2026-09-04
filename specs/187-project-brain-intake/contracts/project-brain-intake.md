# Contract: Project Brain Intake R36V

All schemas are strict and use `schemaVersion: 1`. Every result includes `externalTransportPerformed: false` and `providerExecutionPerformed: false`.

## Read projection

`GET /api/endvera/v1/mobile/project-brain-intake?workspaceId=<id>&projectId=<id>`

Returns the latest intake for that authorized workspace project, including current state/version, owner brief, admitted source inventory, proposed/confirmed snapshot, decisions and explicit limitations. Returns a non-enumerating not-found response for unauthorized or mismatched resources.

`POST` commands on this route require `application/json`. The body is read as a bounded stream and may contain at most 64 KiB, whether or not `Content-Length` is present. A malformed/unsafe length, oversized stream, malformed JSON or unknown command field is rejected before the domain service runs.

## Create packet

```json
{
  "schemaVersion": 1,
  "action": "CREATE_PROJECT_BRAIN_INTAKE",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id"
}
```

Creates `DRAFT` version 1 or returns the exact existing effect on replay.

## Add or replace owner brief while draft

```json
{
  "schemaVersion": 1,
  "action": "ADD_OWNER_BRIEF",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id",
  "intakeId": "intake-id",
  "expectedStateVersion": 1,
  "brief": {
    "summary": "Owner supplied summary",
    "scope": "Owner supplied scope",
    "importantPeople": "Owner supplied people",
    "importantDates": "Owner supplied dates",
    "blockers": "Owner supplied blockers",
    "nextDecision": "Owner supplied next decision"
  }
}
```

At least `summary` is non-empty. Each field is whitespace-normalized, bounded, retained as owner-provided text and never parsed as model output.

## Admit source

`POST /api/endvera/v1/mobile/project-brain-intake/sources` using multipart form data:

- `command`: strict JSON with action `ADMIT_PROJECT_BRAIN_SOURCE`, command/workspace/project/intake IDs, expected state version, kind, name, MIME, declared bytes and optional bounded duration;
- `file`: exactly one binary part.

Allowed types: JPEG, PNG, PDF, DOCX and M4A-compatible audio. Maximum declared and actual size: 10 MiB. Server validates byte signature and applies local metadata sanitization before admission. For M4A, the server parses bounded container/sample metadata, requires a supported audio track, derives actual duration, rejects a duration above 120 seconds or a material declared/actual mismatch, and persists the measured duration. A filename, extension or caller duration alone is never evidence.

This does not claim a provider antivirus scan: provider scanning is fixed to forbidden, including when scanner environment variables exist. Admitted bytes use an explicit-root filesystem-only store that contains no environment-selected backend; configured R2 values cannot activate an SDK, provider import or network request.

Two distinct owner selections with byte-identical content retain separate source identities, ordinals and body-bound `ADMIT_SOURCE` decisions while reusing one canonical `File` row and one local object. Replaying either exact command returns that command's prior effect and creates no additional source, decision, `File`, object or audit effect. Reusing a command ID with any body or byte change is a conflict.

## Read admitted source bytes locally

`GET /api/endvera/v1/mobile/project-brain-intake/sources/<sourceId>`

The caller must be an authenticated, verified CLIENT whose active OWNER/OFFICE_MANAGER membership authorizes the source's workspace and project. The route never accepts a workspace/project override from the query string. It rechecks the source-to-project binding, reads only the explicit local object store and verifies actual byte length and SHA-256 against both `ConstructionProjectBrainSource` and canonical `File` metadata plus detected MIME/local inspection provenance.

A successful response is private/no-store and includes:

- the admitted MIME as `Content-Type`;
- exact byte length as `Content-Length`;
- a sanitized attachment filename in `Content-Disposition`;
- the verified digest in `X-Content-SHA256`;
- the original bytes;
- one appended `FileAccessLog` action of `download` for the authorized actor.

Missing, unauthorized, cross-workspace or cross-project source IDs all return the same non-enumerating not-found response. Corrupt or unverifiable bytes are never returned.

## Submit for review

```json
{
  "schemaVersion": 1,
  "action": "SUBMIT_PROJECT_BRAIN_INTAKE",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id",
  "intakeId": "intake-id",
  "expectedStateVersion": 6
}
```

Requires a complete owner brief and at least one admitted source. Produces `READY_FOR_REVIEW`, a proposed snapshot and `reviewFingerprint`. No source may be added after this transition.

## Confirm exact understanding

```json
{
  "schemaVersion": 1,
  "action": "CONFIRM_PROJECT_BRAIN_INTAKE",
  "commandId": "uuid",
  "workspaceId": "workspace-id",
  "projectId": "project-id",
  "intakeId": "intake-id",
  "expectedStateVersion": 7,
  "reviewFingerprint": "64-lowercase-hex"
}
```

Requires exact current version/fingerprint and OWNER or OFFICE_MANAGER authority. Atomically creates the confirmed snapshot and decision receipt, then transitions the intake to `CONFIRMED`.

## Reject review

Same identity/version contract with action `REJECT_PROJECT_BRAIN_INTAKE`. Transitions only `READY_FOR_REVIEW` to `REJECTED`; it does not delete sources, snapshots or history.

## Audit, retention and crash recovery

Creation, source admission, review, confirmation and rejection retain redacted actor/command/version provenance. Exact command retry converges on one replay audit effect. Eligible state/media refusals create at most one redacted refusal event only after strict command parsing and a fresh authorization check proves that the actor may access the referenced workspace/project.

Malformed JSON or multipart, unknown fields, unauthenticated actors, unauthorized roles, cross-workspace/cross-project references and nonexistent resources do not create a target refusal audit. Audit recording is best-effort and can never replace, disclose or weaken the original failure.

The source-to-`File` relation is restrictive and the generic file sweep excludes `File` rows referenced by project-brain sources. Admission compensates a known losing object write. A local crash reconciler may delete stale `.tmp` files, unreferenced local objects and unreferenced `File` rows only after 24 hours; it never deletes a referenced project-brain source.

The mobile queue is durable and global across workspace/project contexts. Selected source bytes are copied into durable application storage before enqueue. On restart, inventory cleanup uses all queued source intents for retention and only the open project's intents for actionable missing-file errors, so opening project A cannot delete project B's pending source.

## Error semantics

- `400`: invalid content length, malformed JSON, unknown field/action or malformed multipart envelope; no domain command or refusal audit.
- `401`: no authenticated session; no target audit.
- `404`: unauthorized, inactive, cross-workspace, cross-project or nonexistent resource; no protected detail.
- `409`: stale version, changed fingerprint, command-ID reuse with a changed body or changed bytes, or invalid state. An exact replay returns its retained effect.
- Multipart source admission does not require `Content-Length`; the route enforces its byte ceiling while streaming. A malformed declared length is `400`, and either a declared or observed oversized body is `413`.
- `413`: JSON command exceeds 64 KiB or multipart/source exceeds its bounded size.
- `422`: declared media metadata does not match the admitted bytes or supported kind/MIME contract, including malformed M4A, absent structurally coherent AAC track/sample map, duration over 120 seconds or material declared/derived duration drift. Structural AAC validation is not represented as perceptual decoding.
- `429`: route rate limit.
- `429`: per-user concurrent multipart admission capacity is already occupied; the excess body is not consumed.
- `503`: local storage/scanner unavailable; no admission is recorded.

## Assistant query boundary

Only the latest `CONFIRMED` snapshot may answer:

- project summary;
- blockers;
- next decision;
- admitted source inventory.

Any question that requires interpreting a binary source returns the truthful limitation. Draft/proposed snapshots, filenames and source metadata never become job facts.
