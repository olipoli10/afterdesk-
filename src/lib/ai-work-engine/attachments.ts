import {
  FILE_READING_PRIMITIVE_IDS,
  type PlanPrimitiveId,
} from "@/lib/ai-work-engine/primitive-vocabulary";

/**
 * THE ATTACHMENT MANIFEST — how a language model gets to name a client file
 * without ever holding a database identifier.
 *
 * ── THE DEFECT THIS CLOSES (Commercial Readiness audit, blocker #1) ──
 *
 * The planner has always been REQUIRED to write `params.fileId` for an ingest
 * step ("names a fileId from the mandate's own attachments") while never
 * being SHOWN the attachments: fileIds are DB cuids the client's prose cannot
 * contain, so every AI-planned ingest step carried an invented id. The zod
 * schema accepted it (any 1-64-char string), the compiler froze it, and the
 * run discovered the truth only at read time — pause, stall sweep, a person.
 * The entire 1E-alpha file foundation was wired downstream and unreachable
 * from the live path.
 *
 * ── THE DESIGN: CLOSED REFERENCES, DETERMINISTIC RESOLUTION ──
 *
 * The planner receives a MANIFEST of stable references — file_1, file_2, ...
 * in createdAt-then-id order over the task's own eligible uploads — plus the
 * client-authored display name, a coarse kind, and the size. It selects from
 * that closed set. Deterministic code then resolves ref -> real File.id
 * BEFORE the plan version is persisted, so the frozen step params carry the
 * real id and everything downstream (compile, acceptance snapshot, frozen
 * bytes, runtime hash check) is byte-for-byte the 1E-alpha machinery,
 * untouched.
 *
 * Why references rather than handing the model the real cuids: a cuid in a
 * prompt is a cuid in a completion, and a model that has seen ids can emit
 * ids — including ones from other conversations' training-adjacent noise, or
 * half-remembered ones with a character wrong that happen to be VALID SHAPES.
 * A closed vocabulary of ordinals cannot point outside the task by
 * construction: `resolve` looks up an index in THIS task's manifest and
 * nowhere else. There is no lookup by content, no fuzzy match, no database.
 *
 * ── WHAT IS SAFE TO SHOW A PROVIDER, AND WHAT NEVER IS ──
 *
 * The manifest lines sent to the planner carry: ref, fileName, kind, size.
 * The file NAME is client-authored text, the same trust and sensitivity tier
 * as the brief it usually appears in anyway. What is deliberately ABSENT:
 * headers, sample rows, sheet names, row counts — those are file CONTENT,
 * and content of a client file never reaches a provider (the 1E-alpha data
 * class wall; the planner is a provider call). The real fileId is also absent
 * from the provider lines: the model has no reason to see a database key.
 *
 * ── FAILURE IS A QUOTE-TIME FACT, NOT A RUNTIME SURPRISE ──
 *
 * A file-reading step whose params do not resolve (missing ref, malformed
 * ref, out-of-range ref, or a raw id the model made up) is stripped of its
 * fileId at persist time. The ingest schemas REQUIRE fileId, so the compiler
 * refuses the step (`invalid_params`) and the step is a person's — decided
 * before the client is quoted, priced as human work, visible to the admin.
 * The old behaviour failed the same direction but AFTER payment, hours in.
 *
 * Pure on purpose: no server-only, no database, unit-testable. The ownership
 * boundary has two more layers elsewhere: the admin edit action verifies any
 * fileId against the task's own uploads server-side, and the runtime refuses
 * any file absent from the acceptance snapshot's frozen set.
 */

export type ManifestFile = {
  id: string;
  fileName: string;
  sizeBytes: number;
};

export type AttachmentManifestEntry = {
  /** Stable ordinal reference, `file_1`-based, in createdAt-then-id order. */
  ref: string;
  /** The real database id. NEVER included in provider-facing lines. */
  fileId: string;
  fileName: string;
  /** Coarse kind by extension. Only csv/xlsx are machine-ingestible. */
  kind: "csv" | "xlsx" | "other";
  sizeBytes: number;
};

const REF_PATTERN = /^file_([1-9][0-9]{0,2})$/;

function kindOf(fileName: string): AttachmentManifestEntry["kind"] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx")) return "xlsx";
  return "other";
}

/**
 * Build the manifest over the task's eligible files. The CALLER passes the
 * files already ordered (createdAt asc, id asc as tiebreak) — the same order
 * every time, because the refs are meaningless if they move between the
 * planner call and the resolution.
 */
export function buildAttachmentManifest(files: ManifestFile[]): AttachmentManifestEntry[] {
  return files.map((f, i) => ({
    ref: `file_${i + 1}`,
    fileId: f.id,
    fileName: f.fileName,
    kind: kindOf(f.fileName),
    sizeBytes: f.sizeBytes,
  }));
}

/** The provider-facing lines: ref, name, kind, size. No ids, no content. */
export function plannerAttachmentLines(manifest: AttachmentManifestEntry[]): string[] {
  return manifest.map(
    (e) =>
      `${e.ref}: "${e.fileName.slice(0, 120)}" (${e.kind}, ${Math.max(1, Math.round(e.sizeBytes / 1024))} KB)`
  );
}

export type FileParamsResolution =
  | { outcome: "not_file_primitive"; params: unknown }
  | { outcome: "resolved"; params: Record<string, unknown> }
  /**
   * The step named no usable reference. The returned params have fileId
   * REMOVED so the required-field check in the ingest schemas fails and the
   * compiler hands the step to a person. The original value is reported for
   * the audit trail, never persisted as a live pointer.
   */
  | { outcome: "unresolved"; params: Record<string, unknown>; attempted: string | null };

/**
 * Resolve a planned step's params against the manifest. Deterministic, total:
 * every input produces a persistable outcome, and no outcome can point at a
 * file outside the manifest.
 */
export function resolveFileParams(
  manifest: AttachmentManifestEntry[],
  primitiveId: string | null,
  rawParams: unknown
): FileParamsResolution {
  if (
    primitiveId === null ||
    !(FILE_READING_PRIMITIVE_IDS as readonly string[]).includes(primitiveId)
  ) {
    return { outcome: "not_file_primitive", params: rawParams };
  }
  const params =
    rawParams !== null && typeof rawParams === "object"
      ? { ...(rawParams as Record<string, unknown>) }
      : {};
  const attempted = typeof params.fileId === "string" ? params.fileId : null;

  const match = attempted === null ? null : REF_PATTERN.exec(attempted);
  const entry = match === null ? undefined : manifest[Number(match[1]) - 1];

  if (entry === undefined) {
    /**
     * Covers every hostile and every confused shape at once: absent fileId,
     * "file_0", "file_999" beyond the manifest, a raw cuid (invented or
     * real-but-copied), another task's id, or garbage. None of them may
     * survive as a pointer; all of them become a quote-time human step.
     */
    delete params.fileId;
    return { outcome: "unresolved", params, attempted };
  }
  return { outcome: "resolved", params: { ...params, fileId: entry.fileId } };
}

/** For guide text and tests: the ids whose params carry a file reference. */
export const FILE_PARAM_PRIMITIVE_IDS: readonly PlanPrimitiveId[] = FILE_READING_PRIMITIVE_IDS;
