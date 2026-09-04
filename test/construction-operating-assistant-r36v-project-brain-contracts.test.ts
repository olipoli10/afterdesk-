import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PROJECT_BRAIN_MAX_SOURCE_BYTES,
  buildCanonicalProjectBrainSnapshot,
  hashProjectBrainCommand,
  normalizeProjectBrainOwnerBrief,
  projectBrainCommandSchema,
  projectBrainIntakeProjectionSchema,
  projectBrainSourceCommandSchema,
} from "@/lib/construction-operating-assistant-r36v/project-brain-intake";
import {
  inspectProjectBrainSourceLocally,
} from "@/lib/file-security-local";
import { FileRejectedError } from "@/lib/file-security";

const commandId = "36360000-0000-4000-8000-000000000001";

const createCommand = {
  schemaVersion: 1,
  action: "CREATE_PROJECT_BRAIN_INTAKE",
  commandId,
  workspaceId: "workspace-1",
  projectId: "project-1",
} as const;

const ownerBrief = {
  summary: "  Rénovation complète de la cuisine.  ",
  scope: " Armoires, dosseret et peinture. ",
  importantPeople: " Marc — fournisseur. ",
  importantDates: " Livraison mardi. ",
  blockers: " Couleur finale à confirmer. ",
  nextDecision: " Choisir la couleur du coulis. ",
};

function isoBox(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(header.length + payload.length, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, payload]);
}

const REAL_AAC_M4A_FIXTURE = Buffer.from(
  "AAAAHGZ0eXBNNEEgAAACAE00QSBpc29taXNvMgAAAs5tb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAgAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACHXRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAgAAAAAAAAAAAAAAAAQEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAAIAAAAQAAAEAAAAAAZVtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAB9AAAAIAFXEAAAAAAAtaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlcgAAAAFAbWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAEEc3RibAAAAGpzdHNkAAAAAAAAAAEAAABabXA0YQAAAAAAAAABAAAAAAAAAAAAAQAQAAAAAB9AAAAAAAA2ZXNkcwAAAAADgICAJQABAASAgIAXQBUAAAAAAD6AAAAA+gWAgIAFFYhW5QAGgICAAQIAAAAYc3R0cwAAAAAAAAABAAAAAgAABAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAIAAAABAAAAFHN0c3oAAAAAAAAABAAAAAIAAAAUc3RjbwAAAAAAAAABAAAC+gAAABpzZ3BkAQAAAHJvbGwAAAACAAAAAf//AAAAHHNiZ3AAAAAAcm9sbAAAAAEAAAACAAAAAQAAAD11ZHRhAAAANW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAACGlsc3QAAAAIZnJlZQAAABBtZGF0ARggBwEYIAc=",
  "base64",
);

function incompleteM4aFixture(input: {
  handlerType?: "soun" | "vide";
  sampleEntry?: "mp4a" | "avc1";
} = {}): Buffer {
  const handlerType = input.handlerType ?? "soun";
  const sampleEntry = input.sampleEntry ?? "mp4a";
  const ftyp = Buffer.alloc(16);
  ftyp.write("M4A ", 0, 4, "ascii");
  ftyp.writeUInt32BE(0, 4);
  ftyp.write("M4A ", 8, 4, "ascii");
  ftyp.write("isom", 12, 4, "ascii");
  const mdhd = Buffer.alloc(24);
  mdhd.writeUInt32BE(1_000, 12);
  mdhd.writeUInt32BE(60_000, 16);
  const hdlr = Buffer.alloc(24);
  hdlr.write(handlerType, 8, 4, "ascii");
  const stsdHeader = Buffer.alloc(8);
  stsdHeader.writeUInt32BE(1, 4);
  const stsd = Buffer.concat([
    stsdHeader,
    isoBox(sampleEntry, Buffer.alloc(28)),
  ]);
  const stts = Buffer.alloc(16);
  stts.writeUInt32BE(1, 4);
  stts.writeUInt32BE(1, 8);
  stts.writeUInt32BE(60_000, 12);
  const stsz = Buffer.alloc(12);
  stsz.writeUInt32BE(4, 4);
  stsz.writeUInt32BE(1, 8);
  const mdia = isoBox("mdia", Buffer.concat([
    isoBox("mdhd", mdhd),
    isoBox("hdlr", hdlr),
    isoBox("minf", isoBox("stbl", Buffer.concat([
      isoBox("stsd", stsd),
      isoBox("stts", stts),
      isoBox("stsz", stsz),
    ]))),
  ]));
  return Buffer.concat([
    isoBox("ftyp", ftyp),
    isoBox("moov", isoBox("trak", mdia)),
    isoBox("mdat", Buffer.from([0x21, 0x10, 0x04, 0x60])),
  ]);
}

function replaceFirstBoxType(buffer: Buffer, type: string, replacement: string): Buffer {
  const mutated = Buffer.from(buffer);
  const typeOffset = mutated.indexOf(Buffer.from(type, "ascii"));
  if (typeOffset < 4) throw new Error(`Missing ${type} box in deterministic fixture.`);
  mutated.write(replacement, typeOffset, 4, "ascii");
  return mutated;
}

function writeFirstBoxUInt32(
  buffer: Buffer,
  type: string,
  payloadOffset: number,
  value: number,
): Buffer {
  const mutated = Buffer.from(buffer);
  const typeOffset = mutated.indexOf(Buffer.from(type, "ascii"));
  if (typeOffset < 4) throw new Error(`Missing ${type} box in deterministic fixture.`);
  mutated.writeUInt32BE(value, typeOffset + 4 + payloadOffset);
  return mutated;
}

function convertFirstStcoToCo64(buffer: Buffer): Buffer {
  const typeOffset = buffer.indexOf(Buffer.from("stco", "ascii"));
  if (typeOffset < 4) throw new Error("Missing stco box in deterministic fixture.");
  const boxStart = typeOffset - 4;
  const boxSize = buffer.readUInt32BE(boxStart);
  if (boxSize !== 20 || buffer.readUInt32BE(typeOffset + 8) !== 1) {
    throw new Error("Unexpected stco shape in deterministic fixture.");
  }

  const payload = Buffer.alloc(16);
  buffer.copy(payload, 0, typeOffset + 4, typeOffset + 12);
  payload.writeBigUInt64BE(BigInt(buffer.readUInt32BE(typeOffset + 12) + 4), 8);
  const converted = Buffer.concat([
    buffer.subarray(0, boxStart),
    isoBox("co64", payload),
    buffer.subarray(boxStart + boxSize),
  ]);
  for (const parentType of ["moov", "trak", "mdia", "minf", "stbl"]) {
    const parentTypeOffset = converted.indexOf(Buffer.from(parentType, "ascii"));
    if (parentTypeOffset < 4) {
      throw new Error(`Missing ${parentType} parent in deterministic fixture.`);
    }
    converted.writeUInt32BE(
      converted.readUInt32BE(parentTypeOffset - 4) + 4,
      parentTypeOffset - 4,
    );
  }
  return converted;
}

function appendOutOfRangeStscEntry(buffer: Buffer): Buffer {
  const typeOffset = buffer.indexOf(Buffer.from("stsc", "ascii"));
  if (typeOffset < 4) throw new Error("Missing stsc box in deterministic fixture.");
  const boxStart = typeOffset - 4;
  const boxSize = buffer.readUInt32BE(boxStart);
  if (boxSize !== 28 || buffer.readUInt32BE(typeOffset + 8) !== 1) {
    throw new Error("Unexpected stsc shape in deterministic fixture.");
  }

  const payload = Buffer.alloc(32);
  buffer.copy(payload, 0, typeOffset + 4, boxStart + boxSize);
  payload.writeUInt32BE(2, 4);
  payload.writeUInt32BE(100, 20);
  payload.writeUInt32BE(1, 24);
  payload.writeUInt32BE(1, 28);
  const mutated = Buffer.concat([
    buffer.subarray(0, boxStart),
    isoBox("stsc", payload),
    buffer.subarray(boxStart + boxSize),
  ]);
  for (const parentType of ["moov", "trak", "mdia", "minf", "stbl"]) {
    const parentTypeOffset = mutated.indexOf(Buffer.from(parentType, "ascii"));
    if (parentTypeOffset < 4) {
      throw new Error(`Missing ${parentType} parent in deterministic fixture.`);
    }
    mutated.writeUInt32BE(
      mutated.readUInt32BE(parentTypeOffset - 4) + 12,
      parentTypeOffset - 4,
    );
  }
  const stcoTypeOffset = mutated.indexOf(Buffer.from("stco", "ascii"));
  if (stcoTypeOffset < 4) throw new Error("Missing stco box in deterministic fixture.");
  mutated.writeUInt32BE(
    mutated.readUInt32BE(stcoTypeOffset + 12) + 12,
    stcoTypeOffset + 12,
  );
  return mutated;
}

describe("R36V Project Brain intake contracts", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock("@aws-sdk/client-s3");
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("accepts only a strict versioned command and refuses provider control fields", () => {
    expect(projectBrainCommandSchema.parse(createCommand)).toEqual(createCommand);
    expect(() => projectBrainCommandSchema.parse({
      ...createCommand,
      provider: "openrouter",
    })).toThrow();
    expect(() => projectBrainCommandSchema.parse({
      ...createCommand,
      workspaceId: "",
    })).toThrow();
    expect(() => projectBrainCommandSchema.parse({
      ...createCommand,
      schemaVersion: 2,
    })).toThrow();
  });

  it("normalizes bounded owner text without treating it as model output", () => {
    expect(normalizeProjectBrainOwnerBrief(ownerBrief)).toEqual({
      summary: "Rénovation complète de la cuisine.",
      scope: "Armoires, dosseret et peinture.",
      importantPeople: "Marc — fournisseur.",
      importantDates: "Livraison mardi.",
      blockers: "Couleur finale à confirmer.",
      nextDecision: "Choisir la couleur du coulis.",
    });

    expect(() => normalizeProjectBrainOwnerBrief({
      ...ownerBrief,
      summary: " ",
    })).toThrow();
  });

  it("admits only the bounded declared local source vocabulary", () => {
    const document = {
      schemaVersion: 1,
      action: "ADMIT_PROJECT_BRAIN_SOURCE",
      commandId: "36360000-0000-4000-8000-000000000002",
      workspaceId: "workspace-1",
      projectId: "project-1",
      intakeId: "intake-1",
      expectedStateVersion: 2,
      kind: "DOCUMENT",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4_096,
      durationMs: null,
    } as const;

    expect(projectBrainSourceCommandSchema.parse(document)).toEqual(document);
    expect(() => projectBrainSourceCommandSchema.parse({
      ...document,
      sizeBytes: PROJECT_BRAIN_MAX_SOURCE_BYTES + 1,
    })).toThrow();
    expect(() => projectBrainSourceCommandSchema.parse({
      ...document,
      mimeType: "text/plain",
    })).toThrow();
    expect(() => projectBrainSourceCommandSchema.parse({
      ...document,
      durationMs: 60_000,
    })).toThrow();
    expect(() => projectBrainSourceCommandSchema.parse({
      ...document,
      transcript: "invented",
    })).toThrow();
  });

  it("builds the same review fingerprint regardless of source query order", () => {
    const input = {
      project: { id: "project-1", code: "LAVAL-001", name: "Rénovation Laval" },
      ownerBrief: normalizeProjectBrainOwnerBrief(ownerBrief),
      sources: [
        {
          sourceId: "source-2",
          ordinal: 2,
          kind: "VOICE_NOTE" as const,
          displayName: "explication.m4a",
          contentHash: "b".repeat(64),
        },
        {
          sourceId: "source-1",
          ordinal: 1,
          kind: "DOCUMENT" as const,
          displayName: "plan.pdf",
          contentHash: "a".repeat(64),
        },
      ],
    };

    const first = buildCanonicalProjectBrainSnapshot(input);
    const second = buildCanonicalProjectBrainSnapshot({
      ...input,
      sources: [...input.sources].reverse(),
    });

    expect(first).toEqual(second);
    expect(first.canonicalHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.snapshot.ownerBrief.provenance).toBe("OWNER_CONFIRMED");
    expect(first.snapshot.sources.map((source) => source.sourceId)).toEqual([
      "source-1",
      "source-2",
    ]);
    expect(first.snapshot.limitations).toEqual([
      "VOICE_NOT_TRANSCRIBED",
      "DOCUMENT_CONTENT_NOT_INTERPRETED",
    ]);
    expect(first.snapshot).not.toHaveProperty("transcript");
    expect(first.snapshot).not.toHaveProperty("ocr");
    expect(first.snapshot).not.toHaveProperty("extractedText");
    for (const source of first.snapshot.sources) {
      expect(source).not.toHaveProperty("transcript");
      expect(source).not.toHaveProperty("extractedText");
    }
  });

  it("hashes command bodies deterministically and binds every changed field", () => {
    const first = hashProjectBrainCommand(createCommand);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(hashProjectBrainCommand({ ...createCommand })).toBe(first);
    expect(hashProjectBrainCommand({ ...createCommand, projectId: "project-2" })).not.toBe(first);
  });

  it("accepts only a provider-free, transport-free projection", () => {
    const projection = {
      schemaVersion: 1,
      intake: null,
      limitations: [
        "VOICE_NOT_TRANSCRIBED",
        "DOCUMENT_CONTENT_NOT_INTERPRETED",
      ],
      providerExecutionPerformed: false,
      externalTransportPerformed: false,
    } as const;

    expect(projectBrainIntakeProjectionSchema.parse(projection)).toEqual(projection);
    expect(() => projectBrainIntakeProjectionSchema.parse({
      ...projection,
      providerExecutionPerformed: true,
    })).toThrow();
    expect(() => projectBrainIntakeProjectionSchema.parse({
      ...projection,
      providerModel: "hidden",
    })).toThrow();
  });

  it("keeps the local intake path offline even when a provider key exists", async () => {
    vi.stubEnv("CLOUDMERSIVE_API_KEY", "configured-but-forbidden");
    vi.stubEnv("CLOUDMERSIVE_API_URL", "https://must-not-be-called.invalid");
    vi.stubEnv("FILE_SCAN_MODE", "required");
    const fetchMock = vi.fn(() => {
      throw new Error("NETWORK_ATTEMPTED");
    });
    vi.stubGlobal("fetch", fetchMock);

    const inspected = await inspectProjectBrainSourceLocally({
      buffer: REAL_AAC_M4A_FIXTURE,
      extension: "m4a",
      declaredDurationMs: 256,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(inspected.details).toContain("local-only");
    expect(inspected.actualVoiceDurationMs).toBe(256);
    expect(inspected.providerExecutionPerformed).toBe(false);
  });

  it("sanitizes the same DOCX to identical bytes and SHA under different clocks", async () => {
    const document = Buffer.from(zipSync({
      "[Content_Types].xml": strToU8("<Types></Types>"),
      "word/document.xml": strToU8(
        '<w:document><w:body><w:p w:author="Olivier">Projet Laval</w:p></w:body></w:document>',
      ),
      "docProps/core.xml": strToU8(
        "<cp:coreProperties><dc:creator>Olivier</dc:creator></cp:coreProperties>",
      ),
    }, {
      level: 6,
      mtime: Date.UTC(2024, 0, 2, 12, 0, 0),
    }));

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
    const first = await inspectProjectBrainSourceLocally({
      buffer: document,
      extension: "docx",
      declaredDurationMs: null,
    });

    vi.setSystemTime(new Date("2037-11-29T23:59:59.000Z"));
    const second = await inspectProjectBrainSourceLocally({
      buffer: document,
      extension: "docx",
      declaredDurationMs: null,
    });

    expect(first.buffer).toEqual(second.buffer);
    expect(first.sha256).toBe(second.sha256);
  });

  it("requires a real bounded M4A audio track and distrusts declared duration", async () => {
    const genericIsoBmff = Buffer.concat([
      isoBox("ftyp", Buffer.concat([
        Buffer.from("isom", "ascii"),
        Buffer.alloc(4),
        Buffer.from("isom", "ascii"),
      ])),
      isoBox("mdat", Buffer.from([1, 2, 3, 4])),
    ]);
    await expect(inspectProjectBrainSourceLocally({
      buffer: genericIsoBmff,
      extension: "m4a",
      declaredDurationMs: 60_000,
    })).rejects.toBeInstanceOf(FileRejectedError);

    await expect(inspectProjectBrainSourceLocally({
      buffer: incompleteM4aFixture(),
      extension: "m4a",
      declaredDurationMs: 60_000,
    })).rejects.toBeInstanceOf(FileRejectedError);

    await expect(inspectProjectBrainSourceLocally({
      buffer: incompleteM4aFixture({ handlerType: "vide", sampleEntry: "avc1" }),
      extension: "m4a",
      declaredDurationMs: 60_000,
    })).rejects.toBeInstanceOf(FileRejectedError);

    await expect(inspectProjectBrainSourceLocally({
      buffer: replaceFirstBoxType(REAL_AAC_M4A_FIXTURE, "esds", "free"),
      extension: "m4a",
      declaredDurationMs: 256,
    })).rejects.toBeInstanceOf(FileRejectedError);

    await expect(inspectProjectBrainSourceLocally({
      buffer: writeFirstBoxUInt32(REAL_AAC_M4A_FIXTURE, "mp4a", 24, 44_100 * 65_536),
      extension: "m4a",
      declaredDurationMs: 256,
    })).rejects.toBeInstanceOf(FileRejectedError);

    await expect(inspectProjectBrainSourceLocally({
      buffer: replaceFirstBoxType(REAL_AAC_M4A_FIXTURE, "stsc", "free"),
      extension: "m4a",
      declaredDurationMs: 256,
    })).rejects.toBeInstanceOf(FileRejectedError);

    await expect(inspectProjectBrainSourceLocally({
      buffer: writeFirstBoxUInt32(REAL_AAC_M4A_FIXTURE, "stco", 8, 0),
      extension: "m4a",
      declaredDurationMs: 256,
    })).rejects.toBeInstanceOf(FileRejectedError);

    await expect(inspectProjectBrainSourceLocally({
      buffer: appendOutOfRangeStscEntry(REAL_AAC_M4A_FIXTURE),
      extension: "m4a",
      declaredDurationMs: 256,
    })).rejects.toBeInstanceOf(FileRejectedError);

    const oversizedDuration = writeFirstBoxUInt32(
      writeFirstBoxUInt32(REAL_AAC_M4A_FIXTURE, "mdhd", 16, 968_000),
      "stts",
      12,
      484_000,
    );
    await expect(inspectProjectBrainSourceLocally({
      buffer: oversizedDuration,
      extension: "m4a",
      declaredDurationMs: 121_000,
    })).rejects.toThrow("exceeds the 120-second limit");

    await expect(inspectProjectBrainSourceLocally({
      buffer: writeFirstBoxUInt32(REAL_AAC_M4A_FIXTURE, "stts", 12, 1_025),
      extension: "m4a",
      declaredDurationMs: 256,
    })).rejects.toBeInstanceOf(FileRejectedError);

    await expect(inspectProjectBrainSourceLocally({
      buffer: REAL_AAC_M4A_FIXTURE,
      extension: "m4a",
      declaredDurationMs: 10_000,
    })).rejects.toThrow("does not match the M4A audio track");

    await expect(inspectProjectBrainSourceLocally({
      buffer: REAL_AAC_M4A_FIXTURE,
      extension: "m4a",
      declaredDurationMs: 256,
    })).resolves.toMatchObject({ actualVoiceDurationMs: 256 });

    await expect(inspectProjectBrainSourceLocally({
      buffer: convertFirstStcoToCo64(REAL_AAC_M4A_FIXTURE),
      extension: "m4a",
      declaredDurationMs: 256,
    })).resolves.toMatchObject({ actualVoiceDurationMs: 256 });
  });

  it("round-trips local storage byte-exactly without importing or calling R2", async () => {
    vi.stubEnv("R2_ACCOUNT_ID", "configured-but-forbidden");
    vi.stubEnv("R2_ACCESS_KEY_ID", "configured-but-forbidden");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "configured-but-forbidden");
    vi.stubEnv("R2_BUCKET", "configured-but-forbidden");
    const fetchMock = vi.fn(() => {
      throw new Error("NETWORK_ATTEMPTED");
    });
    vi.stubGlobal("fetch", fetchMock);

    let providerModuleImported = false;
    vi.doMock("@aws-sdk/client-s3", () => {
      providerModuleImported = true;
      return {};
    });

    const source = readFileSync("src/lib/storage-local.ts", "utf8");
    expect(source).not.toMatch(
      /@aws-sdk|\bfetch\s*\(|\bprocess\.env\b|from\s+["']node:https?["']|https?:\/\//u,
    );

    const root = await mkdtemp(path.join(tmpdir(), "endvera-r36v-storage-"));
    try {
      const { createLocalObjectStorage, LocalObjectStorageError } = await import(
        "@/lib/storage-local"
      );
      const storage = createLocalObjectStorage(root);
      const key = "project-brain/workspace-1/project-1/source-1.bin";
      const bytes = Buffer.from(Array.from({ length: 256 }, (_, index) => index));

      expect(providerModuleImported).toBe(false);
      expect(await storage.exists(key)).toBe(false);
      await storage.put(key, bytes);
      expect(await storage.exists(key)).toBe(true);
      expect(await storage.read(key)).toEqual(bytes);
      expect(await storage.list("project-brain")).toEqual([
        expect.objectContaining({ key, modifiedAtMs: expect.any(Number) }),
      ]);
      await storage.put(key, Buffer.from(bytes));
      await expect(storage.put(key, Buffer.from("different bytes"))).rejects.toBeInstanceOf(
        LocalObjectStorageError,
      );
      expect(await storage.read(key)).toEqual(bytes);
      await storage.delete(key);
      expect(await storage.exists(key)).toBe(false);
      expect(await storage.list("project-brain")).toEqual([]);
      await storage.delete(key);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses local storage key traversal before touching the filesystem", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "endvera-r36v-storage-"));
    try {
      const { createLocalObjectStorage, LocalStorageKeyError } = await import(
        "@/lib/storage-local"
      );
      const storage = createLocalObjectStorage(root);

      await expect(storage.put("../escape.bin", Buffer.from("forbidden"))).rejects.toBeInstanceOf(
        LocalStorageKeyError,
      );
      await expect(storage.read("C:/escape.bin")).rejects.toBeInstanceOf(LocalStorageKeyError);
      await expect(storage.exists("project-brain/../../escape.bin")).rejects.toBeInstanceOf(
        LocalStorageKeyError,
      );
      await expect(storage.put("project-brain/../alias.bin", Buffer.from("forbidden")))
        .rejects.toBeInstanceOf(LocalStorageKeyError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("re-authorizes the actor and target before uncertain source recovery can replay", () => {
    const service = readFileSync(
      "src/server/construction-operating-assistant-r36v/project-brain-intake.ts",
      "utf8",
    );
    const recoveryStart = service.indexOf("recovery = await withSerializedTransaction");
    const recoveryEnd = service.indexOf("if (!recovery.filePersisted", recoveryStart);
    const recovery = service.slice(recoveryStart, recoveryEnd);

    expect(recoveryStart).toBeGreaterThan(-1);
    expect(recoveryEnd).toBeGreaterThan(recoveryStart);
    expect(recovery).toContain("await requireWriter");
    expect(recovery).toContain("await requireProject");
    expect(recovery).toContain("id: command.intakeId");
    expect(recovery).toContain("workspaceId: command.workspaceId");
    expect(recovery).toContain("projectId: command.projectId");
    expect(recovery.indexOf("await requireWriter")).toBeLessThan(
      recovery.indexOf("const replayed = await replayDecision"),
    );
  });
});
