import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAttachmentManifest,
  plannerAttachmentLines,
  resolveFileParams,
} from "@/lib/ai-work-engine/attachments";
import { parsePrimitiveParams } from "@/lib/ai-work-engine/primitive-params";
import { compileDecisions, HANDOFF_REASONS } from "@/lib/ai-work-engine/compile";
import { PLAN_PRIMITIVES } from "@/lib/ai-work-engine/primitive-vocabulary";

/**
 * LOT A — THE ATTACHMENT MANIFEST, PINNED.
 *
 * The Commercial Readiness audit's blocker #1: the planner was required to
 * write fileIds it was never shown, so every AI-planned ingest step carried
 * an invented id that died at runtime, hours after payment. These tests pin
 * the fix at every seam a regression could reopen: the manifest is
 * positional and closed, the provider lines leak no identifiers, resolution
 * cannot point outside the task, and an unresolvable reference becomes a
 * QUOTE-TIME human step through the existing invalid_params gate.
 */

const FILES = [
  { id: "cmx1aaaaaaaaaaaaaaaaaaaa1", fileName: "suppliers.csv", sizeBytes: 20_480 },
  { id: "cmx2bbbbbbbbbbbbbbbbbbbb2", fileName: "suppliers.csv", sizeBytes: 4_096 },
  { id: "cmx3cccccccccccccccccccc3", fileName: "Inventory Q3.xlsx", sizeBytes: 1_048_576 },
  { id: "cmx4dddddddddddddddddddd4", fileName: "notes finales.pdf", sizeBytes: 900_000 },
];

describe("the manifest is positional, typed and stable", () => {
  it("assigns file_N in caller order, with kinds from extensions", () => {
    const manifest = buildAttachmentManifest(FILES);
    expect(manifest.map((e) => e.ref)).toEqual(["file_1", "file_2", "file_3", "file_4"]);
    expect(manifest.map((e) => e.kind)).toEqual(["csv", "csv", "xlsx", "other"]);
    expect(manifest.map((e) => e.fileId)).toEqual(FILES.map((f) => f.id));
  });

  it("duplicate display names get distinct references: the ref is positional, not textual", () => {
    const manifest = buildAttachmentManifest(FILES);
    expect(manifest[0].fileName).toBe(manifest[1].fileName);
    expect(manifest[0].ref).not.toBe(manifest[1].ref);
    expect(manifest[0].fileId).not.toBe(manifest[1].fileId);
  });

  it("an empty attachment list builds an empty manifest, never a placeholder", () => {
    expect(buildAttachmentManifest([])).toEqual([]);
  });
});

describe("the provider-facing lines carry no identifiers and no content", () => {
  it("renders ref, name, kind and size — and NOT the database id", () => {
    const manifest = buildAttachmentManifest(FILES);
    const lines = plannerAttachmentLines(manifest);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("file_1");
    expect(lines[0]).toContain("suppliers.csv");
    expect(lines[0]).toContain("csv");
    /**
     * THE LEAK PIN. A cuid in a prompt is a cuid a model can echo, misquote
     * or hallucinate variants of. Every real id must be absent from every
     * line, byte for byte.
     */
    for (const line of lines) {
      for (const f of FILES) {
        expect(line.includes(f.id), `provider line leaked a file id: ${line}`).toBe(false);
      }
    }
  });
});

describe("resolution maps refs to THIS task's files and nothing else", () => {
  const manifest = buildAttachmentManifest(FILES);

  it("a valid reference resolves to the real id, preserving the other params", () => {
    const out = resolveFileParams(manifest, "ingest.csv", {
      fileId: "file_2",
      datasetName: "left",
      hasHeaderRow: true,
    });
    expect(out.outcome).toBe("resolved");
    if (out.outcome !== "resolved") return;
    expect(out.params.fileId).toBe(FILES[1].id);
    expect(out.params.datasetName).toBe("left");
    expect(out.params.hasHeaderRow).toBe(true);
  });

  it("every hostile shape is unresolved with the fileId stripped", () => {
    const hostile: (string | null)[] = [
      "file_0", // below range
      "file_5", // beyond the manifest
      "file_999",
      "suppliers.csv", // a name is not a reference
      FILES[0].id, // the REAL id, produced by a model: still refused —
      // the model has no business holding ids, and accepting one here
      // would make the leak pin above pointless
      "cmxother_task_file_cuid_9", // a foreign id
      "file_1; DROP TABLE", // garbage
      null, // absent entirely
    ];
    for (const attempted of hostile) {
      const raw = attempted === null ? { datasetName: "main" } : { fileId: attempted, datasetName: "main" };
      const out = resolveFileParams(manifest, "ingest.csv", raw);
      expect(out.outcome, `should not resolve: ${String(attempted)}`).toBe("unresolved");
      if (out.outcome !== "unresolved") continue;
      expect("fileId" in out.params).toBe(false);
      expect(out.params.datasetName).toBe("main");
    }
  });

  it("property: no input whatsoever can resolve to an id outside the manifest", () => {
    const foreign = "cmxforeignforeignforeign9";
    const probes = ["file_1", "file_4", "file_9", foreign, "x", ""];
    for (const p of probes) {
      const out = resolveFileParams(manifest, "ingest.xlsx", { fileId: p });
      if (out.outcome === "resolved") {
        expect(FILES.map((f) => f.id)).toContain(out.params.fileId);
      }
    }
  });

  it("non-file primitives pass through untouched, fileId-looking keys included", () => {
    const raw = { dataset: "main", keyFields: ["email"], fileId: "not-our-business" };
    const out = resolveFileParams(manifest, "data.dedupe", raw);
    expect(out.outcome).toBe("not_file_primitive");
    expect(out.params).toBe(raw);
  });
});

describe("an unresolved reference is a QUOTE-TIME human step, not a runtime surprise", () => {
  const manifest = buildAttachmentManifest(FILES);

  it("stripped params fail the ingest schema, and the compiler hands the step to a person", () => {
    const out = resolveFileParams(manifest, "ingest.csv", { fileId: "file_99" });
    expect(out.outcome).toBe("unresolved");
    if (out.outcome !== "unresolved") return;

    // The schema half: fileId is REQUIRED, so the stripped params refuse.
    expect(parsePrimitiveParams("ingest.csv", out.params)).toBe(null);

    // The compiler half: same params, compiled — the step is a person's,
    // with the exact reason an operator will read.
    const compiled = compileDecisions(
      [
        {
          planStepId: "s1",
          order: 1,
          title: "Read the file",
          executor: "deterministic_code",
          primitiveId: "ingest.csv",
          primitiveVersion: PLAN_PRIMITIVES["ingest.csv"],
          dependsOnOrder: [],
          params: out.params,
        },
      ],
      { sensitiveData: false, requiredAccessCount: 0, dataClass: "business_confidential" }
    );
    expect(compiled.steps[0].executionMode).toBe("human");
    expect(compiled.steps[0].handoffReason).toBe(HANDOFF_REASONS.invalid_params);
  });

  it("non-vacuity: a RESOLVED reference parses and compiles automated on the same graph", () => {
    const out = resolveFileParams(manifest, "ingest.csv", { fileId: "file_1" });
    expect(out.outcome).toBe("resolved");
    if (out.outcome !== "resolved") return;
    expect(parsePrimitiveParams("ingest.csv", out.params)).not.toBe(null);

    const compiled = compileDecisions(
      [
        {
          planStepId: "s1",
          order: 1,
          title: "Read the file",
          executor: "deterministic_code",
          primitiveId: "ingest.csv",
          primitiveVersion: PLAN_PRIMITIVES["ingest.csv"],
          dependsOnOrder: [],
          params: out.params,
        },
      ],
      { sensitiveData: false, requiredAccessCount: 0, dataClass: "business_confidential" }
    );
    expect(compiled.steps[0].executionMode).toBe("automated");
  });
});

describe("the wiring is real: source pins on the three seams", () => {
  const src = (rel: string) => readFileSync(join(__dirname, "..", "src", rel), "utf8");

  it("the planner prompt carries the attachment section and its input", () => {
    const plan = src(join("lib", "ai-work-engine", "plan.ts"));
    expect(plan).toContain("ATTACHED FILES");
    expect(plan).toContain("attachmentLines: string[]");
    expect(plan).toContain("input.attachmentLines");
    // And the guide stopped asking for an id the model cannot know.
    expect(plan).toContain("file_1, file_2");
  });

  it("the engine builds the manifest and resolves params at persist time", () => {
    const index = src(join("lib", "ai-work-engine", "index.ts"));
    expect(index).toContain("buildAttachmentManifest(task.files)");
    expect(index).toContain("plannerAttachmentLines(attachmentManifest)");
    expect(index).toContain("resolveFileParams(");
  });

  it("the admin edit action enforces the ownership boundary server-side", () => {
    const action = src(join("server", "actions", "admin-plan.ts"));
    expect(action).toContain("primitiveReadsFiles");
    expect(action).toContain('scanStatus: "clean"');
    expect(action).toContain("does not own");
  });
});
