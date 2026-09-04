import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { hashProjectBrainCommand } from "@/lib/construction-operating-assistant-r36v/project-brain-intake";
import { deleteLocalObject, localObjectExists, putLocalObject } from "@/lib/storage-local";
import {
  createConstructionProject,
  initializeConstructionWorkspace,
} from "@/server/construction-assistant-v1/workspace";
import {
  admitProjectBrainSource,
  processProjectBrainIntakeCommand,
  projectBrainIntakeProjectionForUser,
  projectBrainSourceBytesForUser,
  reconcileProjectBrainLocalObjects,
} from "@/server/construction-operating-assistant-r36v/project-brain-intake";
import { processUnifiedAssistantRequest } from "@/server/construction-operating-assistant-r36c/orchestrator";
import { reapOrphanFiles } from "@/server/sweeps";

const storageRaceGate = vi.hoisted(() => ({
  current: null as null | {
    matches: (key: string) => boolean;
    afterRealWrite: (key: string) => Promise<void>;
  },
}));

vi.mock("@/lib/storage-local", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage-local")>();
  return {
    ...actual,
    putLocalObject: async (key: string, data: Buffer) => {
      await actual.putLocalObject(key, data);
      const gate = storageRaceGate.current;
      if (gate?.matches(key)) await gate.afterRealWrite(key);
    },
  };
});

const workspaceIds: string[] = [];

const ownerBrief = {
  summary: "Rénovation complète de la cuisine.",
  scope: "Armoires, dosseret et peinture.",
  importantPeople: "Marc est le fournisseur principal.",
  importantDates: "Livraison prévue mardi.",
  blockers: "La couleur finale du coulis reste à confirmer.",
  nextDecision: "Choisir la couleur du coulis.",
};

const pdf = (label: string) =>
  Buffer.from(
    `%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Label (${label}) >>\nendobj\n%%EOF`,
    "utf8",
  );

// Deterministic, real AAC/M4A fixture generated once with ffmpeg 8.1.1.
// Runtime validation never invokes ffmpeg or any external provider.
const REAL_AAC_M4A_FIXTURE = Buffer.from(
  "AAAAHGZ0eXBNNEEgAAACAE00QSBpc29taXNvMgAAAs5tb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAPoAAAAgAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACHXRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAgAAAAAAAAAAAAAAAAQEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAACRlZHRzAAAAHGVsc3QAAAAAAAAAAQAAAIAAAAQAAAEAAAAAAZVtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAB9AAAAIAFXEAAAAAAAtaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlcgAAAAFAbWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAEEc3RibAAAAGpzdHNkAAAAAAAAAAEAAABabXA0YQAAAAAAAAABAAAAAAAAAAAAAQAQAAAAAB9AAAAAAAA2ZXNkcwAAAAADgICAJQABAASAgIAXQBUAAAAAAD6AAAAA+gWAgIAFFYhW5QAGgICAAQIAAAAYc3R0cwAAAAAAAAABAAAAAgAABAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAIAAAABAAAAFHN0c3oAAAAAAAAABAAAAAIAAAAUc3RjbwAAAAAAAAABAAAC+gAAABpzZ3BkAQAAAHJvbGwAAAACAAAAAf//AAAAHHNiZ3AAAAAAcm9sbAAAAAEAAAACAAAAAQAAAD11ZHRhAAAANW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAACGlsc3QAAAAIZnJlZQAAABBtZGF0ARggBwEYIAc=",
  "base64",
);

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

function oversizedM4aFixture(): Buffer {
  return writeFirstBoxUInt32(
    writeFirstBoxUInt32(REAL_AAC_M4A_FIXTURE, "mdhd", 16, 968_000),
    "stts",
    12,
    484_000,
  );
}

const png = () => Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const jpegBody = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==",
  "base64",
);

function jpegWithApp1(label: string): Buffer {
  const payload = Buffer.from(`Exif\0\0${label}`, "utf8");
  const segment = Buffer.alloc(payload.length + 4);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment.writeUInt16BE(payload.length + 2, 2);
  payload.copy(segment, 4);
  return Buffer.concat([jpegBody.subarray(0, 2), segment, jpegBody.subarray(2)]);
}

async function createUser(label: string) {
  return prisma.user.create({
    data: {
      name: `R36V ${label}`,
      email: `r36v-${label}-${crypto.randomUUID()}@example.invalid`,
      role: "CLIENT",
      emailVerified: true,
    },
  });
}

async function setup(label: string) {
  const owner = await createUser(`${label}-owner`);
  const office = await createUser(`${label}-office`);
  const field = await createUser(`${label}-field`);
  const inactive = await createUser(`${label}-inactive`);
  const outsider = await createUser(`${label}-outsider`);
  const workspace = await initializeConstructionWorkspace({
    userId: owner.id,
    name: `R36V ${label}`,
  });
  workspaceIds.push(workspace.workspaceId);
  await prisma.constructionWorkspaceMember.createMany({
    data: [
      { workspaceId: workspace.workspaceId, userId: office.id, role: "admin", status: "active" },
      { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" },
      { workspaceId: workspace.workspaceId, userId: inactive.id, role: "admin", status: "revoked" },
    ],
  });
  const projectCode = `R36V-${label}`;
  const projectName = `Chantier ${label}`;
  const project = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: projectCode,
    name: projectName,
  });
  const otherProject = await createConstructionProject({
    userId: owner.id,
    workspaceId: workspace.workspaceId,
    code: `R36V-${label}-OTHER`,
    name: `Autre chantier ${label}`,
  });
  return {
    ownerId: owner.id,
    officeId: office.id,
    fieldId: field.id,
    inactiveId: inactive.id,
    outsiderId: outsider.id,
    workspaceId: workspace.workspaceId,
    projectId: project.id,
    projectCode,
    projectName,
    otherProjectId: otherProject.id,
  };
}

type Fixture = Awaited<ReturnType<typeof setup>>;
type CommandResult = Awaited<ReturnType<typeof processProjectBrainIntakeCommand>>;

function submitCommand(input: {
  fixture: Fixture;
  intakeId: string;
  expectedStateVersion: number;
  commandId?: string;
}) {
  return {
    schemaVersion: 1 as const,
    action: "SUBMIT_PROJECT_BRAIN_INTAKE" as const,
    commandId: input.commandId ?? crypto.randomUUID(),
    workspaceId: input.fixture.workspaceId,
    projectId: input.fixture.projectId,
    intakeId: input.intakeId,
    expectedStateVersion: input.expectedStateVersion,
  };
}

function confirmCommand(input: {
  fixture: Fixture;
  intakeId: string;
  expectedStateVersion: number;
  reviewFingerprint: string;
  commandId?: string;
}) {
  return {
    schemaVersion: 1 as const,
    action: "CONFIRM_PROJECT_BRAIN_INTAKE" as const,
    commandId: input.commandId ?? crypto.randomUUID(),
    workspaceId: input.fixture.workspaceId,
    projectId: input.fixture.projectId,
    intakeId: input.intakeId,
    expectedStateVersion: input.expectedStateVersion,
    reviewFingerprint: input.reviewFingerprint,
  };
}

function rejectCommand(input: {
  fixture: Fixture;
  intakeId: string;
  expectedStateVersion: number;
  reviewFingerprint: string;
  commandId?: string;
}) {
  return {
    schemaVersion: 1 as const,
    action: "REJECT_PROJECT_BRAIN_INTAKE" as const,
    commandId: input.commandId ?? crypto.randomUUID(),
    workspaceId: input.fixture.workspaceId,
    projectId: input.fixture.projectId,
    intakeId: input.intakeId,
    expectedStateVersion: input.expectedStateVersion,
    reviewFingerprint: input.reviewFingerprint,
  };
}

async function projectBrainPersistenceCounts(fixture: Fixture) {
  const scope = { workspaceId: fixture.workspaceId, projectId: fixture.projectId };
  const [intakes, sources, snapshots, decisions, audits] = await Promise.all([
    prisma.constructionProjectBrainIntake.count({ where: scope }),
    prisma.constructionProjectBrainSource.count({ where: scope }),
    prisma.constructionProjectBrainSnapshot.count({ where: scope }),
    prisma.constructionProjectBrainDecision.count({ where: scope }),
    prisma.constructionAuditEvent.count({
      where: {
        workspaceId: fixture.workspaceId,
        action: { startsWith: "project_brain_" },
      },
    }),
  ]);
  return { intakes, sources, snapshots, decisions, audits };
}

async function expectStableReplayAndDrift(input: {
  fixture: Fixture;
  original: CommandResult;
  replay: () => Promise<CommandResult>;
  drift: () => Promise<CommandResult>;
}) {
  const beforeReplay = await projectBrainPersistenceCounts(input.fixture);
  const replayed = await input.replay();
  expect(replayed).toEqual({ ...input.original, replayed: true });

  const afterReplay = await projectBrainPersistenceCounts(input.fixture);
  expect(afterReplay).toEqual({
    ...beforeReplay,
    audits: beforeReplay.audits + 1,
  });

  const replayedAgain = await input.replay();
  expect(replayedAgain).toEqual({ ...input.original, replayed: true });
  expect(await projectBrainPersistenceCounts(input.fixture)).toEqual(afterReplay);

  await expect(input.drift()).rejects.toThrow("PROJECT_BRAIN_IDEMPOTENCY_CONFLICT");
  const afterDrift = await projectBrainPersistenceCounts(input.fixture);
  expect(afterDrift).toEqual({
    ...afterReplay,
    audits: afterReplay.audits + 1,
  });
  await expect(input.drift()).rejects.toThrow("PROJECT_BRAIN_IDEMPOTENCY_CONFLICT");
  expect(await projectBrainPersistenceCounts(input.fixture)).toEqual(afterDrift);
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("R36V_TEST_GATE_TIMEOUT")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function createCommand(fixture: Awaited<ReturnType<typeof setup>>, commandId = crypto.randomUUID()) {
  return {
    schemaVersion: 1 as const,
    action: "CREATE_PROJECT_BRAIN_INTAKE" as const,
    commandId,
    workspaceId: fixture.workspaceId,
    projectId: fixture.projectId,
  };
}

function briefCommand(input: {
  fixture: Awaited<ReturnType<typeof setup>>;
  intakeId: string;
  expectedStateVersion: number;
  commandId?: string;
  projectId?: string;
}) {
  return {
    schemaVersion: 1 as const,
    action: "ADD_OWNER_BRIEF" as const,
    commandId: input.commandId ?? crypto.randomUUID(),
    workspaceId: input.fixture.workspaceId,
    projectId: input.projectId ?? input.fixture.projectId,
    intakeId: input.intakeId,
    expectedStateVersion: input.expectedStateVersion,
    brief: ownerBrief,
  };
}

function sourceCommand(input: {
  fixture: Awaited<ReturnType<typeof setup>>;
  intakeId: string;
  expectedStateVersion: number;
  commandId?: string;
  kind?: "DOCUMENT" | "PHOTO" | "VOICE_NOTE";
  label: string;
}) {
  const kind = input.kind ?? "DOCUMENT";
  const bytes = kind === "VOICE_NOTE"
    ? Buffer.from(REAL_AAC_M4A_FIXTURE)
    : kind === "PHOTO"
      ? png()
      : pdf(input.label);
  return {
    bytes,
    command: {
      schemaVersion: 1 as const,
      action: "ADMIT_PROJECT_BRAIN_SOURCE" as const,
      commandId: input.commandId ?? crypto.randomUUID(),
      workspaceId: input.fixture.workspaceId,
      projectId: input.fixture.projectId,
      intakeId: input.intakeId,
      expectedStateVersion: input.expectedStateVersion,
      kind,
      fileName: kind === "VOICE_NOTE"
        ? `${input.label}.m4a`
        : kind === "PHOTO"
          ? `${input.label}.png`
          : `${input.label}.pdf`,
      mimeType: kind === "VOICE_NOTE"
        ? ("audio/m4a" as const)
        : kind === "PHOTO"
          ? ("image/png" as const)
          : ("application/pdf" as const),
      sizeBytes: bytes.length,
      durationMs: kind === "VOICE_NOTE" ? 256 : null,
    },
  };
}

async function createBriefAndSources(
  fixture: Awaited<ReturnType<typeof setup>>,
  label: string,
) {
  const created = await processProjectBrainIntakeCommand({
    userId: fixture.ownerId,
    command: createCommand(fixture),
  });
  const briefed = await processProjectBrainIntakeCommand({
    userId: fixture.ownerId,
    command: briefCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: created.stateVersion,
    }),
  });

  let stateVersion = briefed.stateVersion;
  for (const source of [
    sourceCommand({ fixture, intakeId: created.intakeId, expectedStateVersion: stateVersion, label: `${label}-plan` }),
    sourceCommand({ fixture, intakeId: created.intakeId, expectedStateVersion: stateVersion + 1, label: `${label}-site`, kind: "PHOTO" }),
    sourceCommand({ fixture, intakeId: created.intakeId, expectedStateVersion: stateVersion + 2, label: `${label}-detail`, kind: "PHOTO" }),
    sourceCommand({ fixture, intakeId: created.intakeId, expectedStateVersion: stateVersion + 3, label: `${label}-voice`, kind: "VOICE_NOTE" }),
  ]) {
    const admitted = await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: source.command,
      bytes: source.bytes,
    });
    stateVersion = admitted.stateVersion;
    expect(admitted).toMatchObject({
      intakeId: created.intakeId,
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
      replayed: false,
      providerExecutionPerformed: false,
      externalTransportPerformed: false,
    });
  }

  return { created, stateVersion };
}

describe("R36V Project Brain Intake on disposable PostgreSQL", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => {
      throw new Error("R36V_NETWORK_ATTEMPTED");
    }));
  });

  it("enforces the owner/admin/member/inactive/outsider matrix on create, read and mutation", async () => {
    const fixture = await setup("ROLE-MATRIX");

    const ownerCreated = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const ownerBriefed = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: briefCommand({
        fixture,
        intakeId: ownerCreated.intakeId,
        expectedStateVersion: ownerCreated.stateVersion,
      }),
    });
    const adminMutatedOwnerIntake = await processProjectBrainIntakeCommand({
      userId: fixture.officeId,
      command: briefCommand({
        fixture,
        intakeId: ownerCreated.intakeId,
        expectedStateVersion: ownerBriefed.stateVersion,
      }),
    });

    const adminCreated = await processProjectBrainIntakeCommand({
      userId: fixture.officeId,
      command: { ...createCommand(fixture), projectId: fixture.otherProjectId },
    });
    const adminBriefed = await processProjectBrainIntakeCommand({
      userId: fixture.officeId,
      command: briefCommand({
        fixture,
        projectId: fixture.otherProjectId,
        intakeId: adminCreated.intakeId,
        expectedStateVersion: adminCreated.stateVersion,
      }),
    });
    const ownerMutatedAdminIntake = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: briefCommand({
        fixture,
        projectId: fixture.otherProjectId,
        intakeId: adminCreated.intakeId,
        expectedStateVersion: adminBriefed.stateVersion,
      }),
    });

    expect(adminMutatedOwnerIntake).toMatchObject({
      projectId: fixture.projectId,
      stateVersion: 3,
      status: "DRAFT",
    });
    expect(ownerMutatedAdminIntake).toMatchObject({
      projectId: fixture.otherProjectId,
      stateVersion: 3,
      status: "DRAFT",
    });
    await expect(projectBrainIntakeProjectionForUser({
      userId: fixture.ownerId,
      workspaceId: fixture.workspaceId,
      projectId: fixture.otherProjectId,
    })).resolves.toMatchObject({ intake: { id: adminCreated.intakeId } });
    await expect(projectBrainIntakeProjectionForUser({
      userId: fixture.officeId,
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
    })).resolves.toMatchObject({ intake: { id: ownerCreated.intakeId } });

    const deniedActors = [
      { label: "member", userId: fixture.fieldId },
      { label: "inactive", userId: fixture.inactiveId },
      { label: "outsider", userId: fixture.outsiderId },
    ];
    for (const actor of deniedActors) {
      await expect(processProjectBrainIntakeCommand({
        userId: actor.userId,
        command: createCommand(fixture),
      }), actor.label).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
      await expect(projectBrainIntakeProjectionForUser({
        userId: actor.userId,
        workspaceId: fixture.workspaceId,
        projectId: fixture.projectId,
      }), actor.label).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
      await expect(processProjectBrainIntakeCommand({
        userId: actor.userId,
        command: briefCommand({
          fixture,
          intakeId: ownerCreated.intakeId,
          expectedStateVersion: adminMutatedOwnerIntake.stateVersion,
        }),
      }), actor.label).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    }
  });

  afterEach(() => {
    storageRaceGate.current = null;
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (workspaceIds.length > 0) {
      const sourceFiles = await prisma.constructionProjectBrainSource.findMany({
        where: { workspaceId: { in: workspaceIds } },
        select: { fileId: true },
        distinct: ["fileId"],
      }).catch(() => []);
      const files = sourceFiles.length > 0
        ? await prisma.file.findMany({
            where: { id: { in: sourceFiles.map((source) => source.fileId) } },
            select: { storageKey: true },
          })
        : [];
      await Promise.all(files.map((file) => deleteLocalObject(file.storageKey)));
    }
    await prisma.$disconnect();
  });

  it("has the additive tenant-bound schema, checks and partial active-intake index", async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'ConstructionProjectBrainIntake',
          'ConstructionProjectBrainSource',
          'ConstructionProjectBrainSnapshot',
          'ConstructionProjectBrainDecision'
        )
      ORDER BY table_name
    `;
    expect(tables.map((table) => table.table_name)).toEqual([
      "ConstructionProjectBrainDecision",
      "ConstructionProjectBrainIntake",
      "ConstructionProjectBrainSnapshot",
      "ConstructionProjectBrainSource",
    ]);

    const checks = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE conname LIKE 'CPB%_check'
      ORDER BY conname
    `;
    expect(checks.map((constraint) => constraint.conname)).toEqual(expect.arrayContaining([
      "CPBI_state_shape_check",
      "CPBS_duration_check",
      "CPBS_kind_mime_check",
      "CPBD_versions_check",
      "CPBD_snapshot_binding_check",
    ]));

    const sourceCheckDefinitions = await prisma.$queryRaw<Array<{
      conname: string;
      definition: string;
    }>>`
      SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname IN ('CPBS_duration_check', 'CPBS_kind_mime_check', 'CPBS_size_ordinal_check')
      ORDER BY conname
    `;
    expect(sourceCheckDefinitions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conname: "CPBS_duration_check",
        definition: expect.stringContaining("120000"),
      }),
      expect.objectContaining({
        conname: "CPBS_kind_mime_check",
        definition: expect.stringContaining("application/pdf"),
      }),
      expect.objectContaining({
        conname: "CPBS_size_ordinal_check",
        definition: expect.stringMatching(/ordinal[\s\S]*20/u),
      }),
    ]));

    const activeIndex = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'CPBI_one_active_project_key'
    `;
    expect(activeIndex).toHaveLength(1);
    expect(activeIndex[0].indexdef).toContain("READY_FOR_REVIEW");

    const voiceIndex = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'CPBS_one_voice_note_per_intake_key'
    `;
    expect(voiceIndex).toHaveLength(1);
    expect(voiceIndex[0].indexdef).toContain("VOICE_NOTE");

    const immutabilityTriggers = await prisma.$queryRaw<Array<{ tgname: string }>>`
      SELECT tgname
      FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgname LIKE 'ConstructionProjectBrain%'
      ORDER BY tgname
    `;
    expect(immutabilityTriggers.map((trigger) => trigger.tgname)).toEqual(
      expect.arrayContaining([
        "ConstructionProjectBrainIntake_guard_update_delete",
        "ConstructionProjectBrainIntake_no_truncate",
        "ConstructionProjectBrainIntake_atomic_evidence",
        "ConstructionProjectBrainDecision_atomic_projection",
        "ConstructionProjectBrainSource_atomic_projection",
        "ConstructionProjectBrainSnapshot_atomic_projection",
        "ConstructionProjectBrainSource_immutable",
        "ConstructionProjectBrainSource_no_truncate",
        "ConstructionProjectBrainSnapshot_immutable",
        "ConstructionProjectBrainSnapshot_no_truncate",
        "ConstructionProjectBrainDecision_immutable",
        "ConstructionProjectBrainDecision_no_truncate",
      ]),
    );

    const tenantForeignKeys = await prisma.$queryRaw<Array<{
      constraint_name: string;
      update_rule: string;
      delete_rule: string;
    }>>`
      SELECT constraint_name, update_rule, delete_rule
      FROM information_schema.referential_constraints
      WHERE constraint_schema = 'public'
        AND constraint_name LIKE 'CPB%_fkey'
      ORDER BY constraint_name
    `;
    expect(tenantForeignKeys).toHaveLength(10);
    expect(tenantForeignKeys.every((foreignKey) =>
      foreignKey.update_rule === "RESTRICT" && foreignKey.delete_rule === "RESTRICT"
    )).toBe(true);

    const fileForeignKeys = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT constraint_name AS conname
      FROM information_schema.constraint_column_usage
      WHERE table_schema = 'public'
        AND table_name = 'File'
        AND constraint_name LIKE 'CPB%'
    `;
    expect(fileForeignKeys).toEqual([{ conname: "CPBS_file_fkey" }]);

    const atomicEvidenceTriggers = await prisma.$queryRaw<Array<{
      tgname: string;
      tgdeferrable: boolean;
      tginitdeferred: boolean;
    }>>`
      SELECT tgname, tgdeferrable, tginitdeferred
      FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgname IN (
          'ConstructionProjectBrainIntake_atomic_evidence',
          'ConstructionProjectBrainDecision_atomic_projection',
          'ConstructionProjectBrainSource_atomic_projection',
          'ConstructionProjectBrainSnapshot_atomic_projection'
        )
      ORDER BY tgname
    `;
    expect(atomicEvidenceTriggers.map((trigger) => trigger.tgname)).toEqual([
      "ConstructionProjectBrainDecision_atomic_projection",
      "ConstructionProjectBrainIntake_atomic_evidence",
      "ConstructionProjectBrainSnapshot_atomic_projection",
      "ConstructionProjectBrainSource_atomic_projection",
    ]);
    expect(atomicEvidenceTriggers.every((trigger) =>
      trigger.tgdeferrable && trigger.tginitdeferred
    )).toBe(true);
  });

  it("refuses an intake projection version unless its decision and reviewed snapshot commit atomically", async () => {
    const fixture = await setup("ATOMIC-EVIDENCE");
    await expect(prisma.$transaction(async (tx) => {
      await tx.constructionProjectBrainIntake.create({
        data: {
          id: crypto.randomUUID(),
          workspaceId: fixture.workspaceId,
          projectId: fixture.projectId,
          intakeSequence: 1,
          createCommandId: crypto.randomUUID(),
          createCommandHash: "a".repeat(64),
          createdByUserId: fixture.ownerId,
        },
      });
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    })).rejects.toThrow(/requires one matching immutable decision/u);

    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "ConstructionProjectBrainIntake"
        SET "summary" = 'projection without a decision',
            "stateVersion" = "stateVersion" + 1,
            "updatedAt" = NOW()
        WHERE "id" = ${created.intakeId}
      `;
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    })).rejects.toThrow(/requires one matching immutable decision/u);

    const unchanged = await prisma.constructionProjectBrainIntake.findUniqueOrThrow({
      where: { id: created.intakeId },
    });
    expect(unchanged).toMatchObject({ stateVersion: 1, status: "DRAFT", summary: null });

    const briefed = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: briefCommand({
        fixture,
        intakeId: created.intakeId,
        expectedStateVersion: created.stateVersion,
      }),
    });
    const source = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: briefed.stateVersion,
      label: "atomic-evidence-plan",
    });
    const admitted = await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: source.command,
      bytes: source.bytes,
    });
    const submitted = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: submitCommand({
        fixture,
        intakeId: created.intakeId,
        expectedStateVersion: admitted.stateVersion,
      }),
    });

    await expect(prisma.$transaction(async (tx) => {
      const nextStateVersion = submitted.stateVersion + 1;
      const commandId = crypto.randomUUID();
      await tx.constructionProjectBrainIntake.update({
        where: { id: created.intakeId },
        data: {
          status: "CONFIRMED",
          stateVersion: nextStateVersion,
          confirmedAt: new Date(),
        },
      });
      await tx.constructionProjectBrainDecision.create({
        data: {
          workspaceId: fixture.workspaceId,
          projectId: fixture.projectId,
          intakeId: created.intakeId,
          commandId,
          commandHash: "b".repeat(64),
          decision: "CONFIRM_EXACT",
          priorStateVersion: submitted.stateVersion,
          nextStateVersion,
          snapshotHash: submitted.reviewFingerprint,
          result: { attemptedBypass: true },
          resultHash: "c".repeat(64),
          actorUserId: fixture.ownerId,
        },
      });
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    })).rejects.toThrow(/confirmation requires its immutable confirmed snapshot/u);

    await expect(prisma.constructionProjectBrainIntake.findUniqueOrThrow({
      where: { id: created.intakeId },
    })).resolves.toMatchObject({
      status: "READY_FOR_REVIEW",
      stateVersion: submitted.stateVersion,
      reviewFingerprint: submitted.reviewFingerprint,
      confirmedAt: null,
    });
  });

  it("refuses a decision pre-seeded outside the matching projection transaction", async () => {
    const fixture = await setup("ATOMIC-PRESEED-DECISION");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainDecision" (
          "id", "workspaceId", "projectId", "intakeId", "commandId",
          "commandHash", "decision", "priorStateVersion", "nextStateVersion",
          "snapshotHash", "result", "resultHash", "actorUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${created.intakeId}, ${crypto.randomUUID()}, ${"1".repeat(64)},
          'ADD_OWNER_BRIEF', 1, 2, NULL,
          CAST(${JSON.stringify({ attemptedBypass: "preseed-decision" })} AS JSONB),
          ${"2".repeat(64)}, ${fixture.ownerId}
        )
      `;
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    })).rejects.toThrow(/decision must commit with its matching intake projection/iu);

    await expect(prisma.constructionProjectBrainIntake.findUniqueOrThrow({
      where: { id: created.intakeId },
    })).resolves.toMatchObject({ status: "DRAFT", stateVersion: 1 });
    expect(await prisma.constructionProjectBrainDecision.count({
      where: { intakeId: created.intakeId },
    })).toBe(1);
  });

  it("refuses a source pre-seeded outside the matching ADMIT_SOURCE transaction", async () => {
    const fixture = await setup("ATOMIC-PRESEED-SOURCE");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const fileId = crypto.randomUUID();
    const commandId = crypto.randomUUID();

    await expect(prisma.$transaction(async (tx) => {
      await tx.file.create({
        data: {
          id: fileId,
          kind: "input",
          uploaderId: fixture.ownerId,
          storageKey: `project-brain-intake/${fixture.workspaceId}/${fixture.projectId}/${created.intakeId}/${fileId}-${"3".repeat(64)}.pdf`,
          fileName: "preseeded.pdf",
          mime: "application/pdf",
          sizeBytes: 1,
          scanStatus: "pending",
          detectedMime: "application/pdf",
          sha256: "3".repeat(64),
          scanDetails: "LOCAL_TEST_ATOMIC_PRESEED",
        },
      });
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainSource" (
          "id", "workspaceId", "projectId", "intakeId", "commandId",
          "commandHash", "kind", "fileId", "contentHash", "displayName",
          "mimeType", "sizeBytes", "durationMs", "ordinal", "createdByUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${created.intakeId}, ${commandId}, ${"4".repeat(64)}, 'DOCUMENT',
          ${fileId}, ${"3".repeat(64)}, 'preseeded.pdf', 'application/pdf',
          1, NULL, 1, ${fixture.ownerId}
        )
      `;
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    })).rejects.toThrow(/source must commit with its matching ADMIT_SOURCE projection and decision/iu);

    expect(await prisma.constructionProjectBrainSource.count({
      where: { intakeId: created.intakeId },
    })).toBe(0);
    expect(await prisma.file.count({ where: { id: fileId } })).toBe(0);
  });

  it("refuses a snapshot pre-seeded outside the matching review transaction", async () => {
    const fixture = await setup("ATOMIC-PRESEED-SNAPSHOT");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainSnapshot" (
          "id", "workspaceId", "projectId", "intakeId", "stateVersion",
          "status", "snapshot", "canonicalHash", "createdByUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${created.intakeId}, 2, 'PROPOSED',
          CAST(${JSON.stringify({ attemptedBypass: "preseed-snapshot" })} AS JSONB),
          ${"5".repeat(64)}, ${fixture.ownerId}
        )
      `;
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    })).rejects.toThrow(/(?:snapshot must commit with its matching intake projection and decision|must exactly match its relational intake and sources)/iu);

    expect(await prisma.constructionProjectBrainSnapshot.count({
      where: { intakeId: created.intakeId },
    })).toBe(0);
  });

  it("refuses ADMIT_SOURCE when raw SQL also changes any owner-brief field", async () => {
    const fixture = await setup("ATOMIC-ADMIT-BRIEF-FREEZE");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const fileId = crypto.randomUUID();
    const commandId = crypto.randomUUID();
    const commandHash = "6".repeat(64);

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "ConstructionProjectBrainIntake"
        SET "summary" = 'Owner brief modified through ADMIT_SOURCE',
            "stateVersion" = 2,
            "updatedAt" = NOW()
        WHERE "id" = ${created.intakeId}
      `;
      await tx.file.create({
        data: {
          id: fileId,
          kind: "input",
          uploaderId: fixture.ownerId,
          storageKey: `project-brain-intake/${fixture.workspaceId}/${fixture.projectId}/${created.intakeId}/${fileId}-${"7".repeat(64)}.pdf`,
          fileName: "brief-bypass.pdf",
          mime: "application/pdf",
          sizeBytes: 1,
          scanStatus: "pending",
          detectedMime: "application/pdf",
          sha256: "7".repeat(64),
          scanDetails: "LOCAL_TEST_ATOMIC_BRIEF_BYPASS",
        },
      });
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainSource" (
          "id", "workspaceId", "projectId", "intakeId", "commandId",
          "commandHash", "kind", "fileId", "contentHash", "displayName",
          "mimeType", "sizeBytes", "durationMs", "ordinal", "createdByUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${created.intakeId}, ${commandId}, ${commandHash}, 'DOCUMENT',
          ${fileId}, ${"7".repeat(64)}, 'brief-bypass.pdf', 'application/pdf',
          1, NULL, 1, ${fixture.ownerId}
        )
      `;
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainDecision" (
          "id", "workspaceId", "projectId", "intakeId", "commandId",
          "commandHash", "decision", "priorStateVersion", "nextStateVersion",
          "snapshotHash", "result", "resultHash", "actorUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${created.intakeId}, ${commandId}, ${commandHash}, 'ADMIT_SOURCE',
          1, 2, NULL,
          CAST(${JSON.stringify({ attemptedBypass: "admit-source-owner-brief" })} AS JSONB),
          ${"8".repeat(64)}, ${fixture.ownerId}
        )
      `;
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    })).rejects.toThrow(/ADMIT_SOURCE cannot modify owner-brief fields/u);

    await expect(prisma.constructionProjectBrainIntake.findUniqueOrThrow({
      where: { id: created.intakeId },
    })).resolves.toMatchObject({ summary: null, stateVersion: 1 });
    expect(await prisma.constructionProjectBrainSource.count({
      where: { intakeId: created.intakeId },
    })).toBe(0);
    expect(await prisma.constructionProjectBrainDecision.count({
      where: { intakeId: created.intakeId },
    })).toBe(1);
  });

  it("refuses a CONFIRMED snapshot whose JSON differs from the bound PROPOSED snapshot", async () => {
    const fixture = await setup("ATOMIC-CONFIRMED-JSON");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const briefed = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: briefCommand({
        fixture,
        intakeId: created.intakeId,
        expectedStateVersion: created.stateVersion,
      }),
    });
    const source = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: briefed.stateVersion,
      label: "confirmed-json-plan",
    });
    const admitted = await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: source.command,
      bytes: source.bytes,
    });
    const submitted = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: submitCommand({
        fixture,
        intakeId: created.intakeId,
        expectedStateVersion: admitted.stateVersion,
      }),
    });
    const commandId = crypto.randomUUID();
    const commandHash = "9".repeat(64);

    await expect(prisma.$transaction(async (tx) => {
      const nextStateVersion = submitted.stateVersion + 1;
      await tx.$executeRaw`
        UPDATE "ConstructionProjectBrainIntake"
        SET "status" = 'CONFIRMED',
            "stateVersion" = ${nextStateVersion},
            "confirmedAt" = NOW(),
            "updatedAt" = NOW()
        WHERE "id" = ${created.intakeId}
      `;
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainSnapshot" (
          "id", "workspaceId", "projectId", "intakeId", "stateVersion",
          "status", "snapshot", "canonicalHash", "createdByUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${created.intakeId}, ${nextStateVersion}, 'CONFIRMED',
          CAST(${JSON.stringify({ attemptedBypass: "same-hash-different-json" })} AS JSONB),
          ${submitted.reviewFingerprint!}, ${fixture.ownerId}
        )
      `;
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainDecision" (
          "id", "workspaceId", "projectId", "intakeId", "commandId",
          "commandHash", "decision", "priorStateVersion", "nextStateVersion",
          "snapshotHash", "result", "resultHash", "actorUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${created.intakeId}, ${commandId}, ${commandHash}, 'CONFIRM_EXACT',
          ${submitted.stateVersion}, ${nextStateVersion}, ${submitted.reviewFingerprint!},
          CAST(${JSON.stringify({ attemptedBypass: "same-hash-different-json" })} AS JSONB),
          ${"a".repeat(64)}, ${fixture.ownerId}
        )
      `;
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    })).rejects.toThrow(/must exactly match (?:its relational intake and sources|its bound PROPOSED snapshot)/u);

    await expect(prisma.constructionProjectBrainIntake.findUniqueOrThrow({
      where: { id: created.intakeId },
    })).resolves.toMatchObject({
      status: "READY_FOR_REVIEW",
      stateVersion: submitted.stateVersion,
      confirmedAt: null,
    });
    expect(await prisma.constructionProjectBrainSnapshot.count({
      where: { intakeId: created.intakeId, status: "CONFIRMED" },
    })).toBe(0);
    expect(await prisma.constructionProjectBrainDecision.count({
      where: { intakeId: created.intakeId, decision: "CONFIRM_EXACT" },
    })).toBe(0);
  });

  it("refuses a CREATE projection with pre-populated owner or review lifecycle state", async () => {
    const fixture = await setup("ATOMIC-POISONED-CREATE");
    const intakeId = crypto.randomUUID();
    const commandId = crypto.randomUUID();
    const commandHash = "b".repeat(64);

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainIntake" (
          "id", "workspaceId", "projectId", "intakeSequence",
          "createCommandId", "createCommandHash", "status", "stateVersion",
          "summary", "createdByUserId", "updatedAt"
        ) VALUES (
          ${intakeId}, ${fixture.workspaceId}, ${fixture.projectId}, 1,
          ${commandId}, ${commandHash}, 'DRAFT', 1,
          'pre-populated outside CREATE', ${fixture.ownerId}, NOW()
        )
      `;
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainDecision" (
          "id", "workspaceId", "projectId", "intakeId", "commandId",
          "commandHash", "decision", "priorStateVersion", "nextStateVersion",
          "snapshotHash", "result", "resultHash", "actorUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${intakeId}, ${commandId}, ${commandHash}, 'CREATE', 0, 1, NULL,
          CAST(${JSON.stringify({ attemptedBypass: "poisoned-create" })} AS JSONB),
          ${"d".repeat(64)}, ${fixture.ownerId}
        )
      `;
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    })).rejects.toThrow(/CREATE projection must be empty/u);

    expect(await prisma.constructionProjectBrainIntake.count({ where: { id: intakeId } })).toBe(0);
    expect(await prisma.constructionProjectBrainDecision.count({ where: { intakeId } })).toBe(0);
  });

  it("refuses a DRAFT decision that mutates review lifecycle fields", async () => {
    const fixture = await setup("ATOMIC-DRAFT-LIFECYCLE");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const commandId = crypto.randomUUID();
    const commandHash = "e".repeat(64);

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "ConstructionProjectBrainIntake"
        SET "submittedAt" = NOW(), "reviewFingerprint" = ${"f".repeat(64)},
            "stateVersion" = 2, "updatedAt" = NOW()
        WHERE "id" = ${created.intakeId}
      `;
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainDecision" (
          "id", "workspaceId", "projectId", "intakeId", "commandId",
          "commandHash", "decision", "priorStateVersion", "nextStateVersion",
          "snapshotHash", "result", "resultHash", "actorUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${created.intakeId}, ${commandId}, ${commandHash}, 'ADD_OWNER_BRIEF', 1, 2, NULL,
          CAST(${JSON.stringify({ attemptedBypass: "draft-lifecycle" })} AS JSONB),
          ${"1".repeat(64)}, ${fixture.ownerId}
        )
      `;
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    })).rejects.toThrow(/CPBI_state_shape_check/u);

    await expect(prisma.constructionProjectBrainIntake.findUniqueOrThrow({
      where: { id: created.intakeId },
    })).resolves.toMatchObject({ stateVersion: 1, submittedAt: null, reviewFingerprint: null });
  });

  it("refuses an otherwise reciprocal review transition with no admitted source", async () => {
    const fixture = await setup("ATOMIC-NO-SOURCE-REVIEW");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const briefed = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: briefCommand({
        fixture,
        intakeId: created.intakeId,
        expectedStateVersion: created.stateVersion,
      }),
    });
    const commandId = crypto.randomUUID();
    const commandHash = "7".repeat(64);
    const noSourceSnapshot = {
      schemaVersion: 1,
      project: {
        id: fixture.projectId,
        code: fixture.projectCode,
        name: fixture.projectName,
      },
      ownerBrief: { ...ownerBrief, provenance: "OWNER_CONFIRMED" },
      sources: [],
      limitations: [],
    };
    const reviewFingerprint = hashProjectBrainCommand(noSourceSnapshot);
    const nextStateVersion = briefed.stateVersion + 1;

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "ConstructionProjectBrainIntake"
        SET "status" = 'READY_FOR_REVIEW', "stateVersion" = ${nextStateVersion},
            "reviewFingerprint" = ${reviewFingerprint}, "submittedAt" = NOW(),
            "updatedAt" = NOW()
        WHERE "id" = ${created.intakeId}
      `;
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainSnapshot" (
          "id", "workspaceId", "projectId", "intakeId", "stateVersion",
          "status", "snapshot", "canonicalHash", "createdByUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${created.intakeId}, ${nextStateVersion}, 'PROPOSED',
          CAST(${JSON.stringify(noSourceSnapshot)} AS JSONB),
          ${reviewFingerprint}, ${fixture.ownerId}
        )
      `;
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainDecision" (
          "id", "workspaceId", "projectId", "intakeId", "commandId",
          "commandHash", "decision", "priorStateVersion", "nextStateVersion",
          "snapshotHash", "result", "resultHash", "actorUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${created.intakeId}, ${commandId}, ${commandHash}, 'SUBMIT_FOR_REVIEW',
          ${briefed.stateVersion}, ${nextStateVersion}, ${reviewFingerprint},
          CAST(${JSON.stringify({ attemptedBypass: "review-with-no-source" })} AS JSONB),
          ${"9".repeat(64)}, ${fixture.ownerId}
        )
      `;
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    })).rejects.toThrow(/review requires at least one immutable source/u);

    await expect(prisma.constructionProjectBrainIntake.findUniqueOrThrow({
      where: { id: created.intakeId },
    })).resolves.toMatchObject({ stateVersion: briefed.stateVersion, status: "DRAFT" });
    expect(await prisma.constructionProjectBrainSnapshot.count({
      where: { intakeId: created.intakeId },
    })).toBe(0);
  });

  it("refuses a schema-shaped snapshot that invents owner brief content", async () => {
    const fixture = await setup("ATOMIC-INVENTED-SNAPSHOT");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const briefed = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: briefCommand({
        fixture,
        intakeId: created.intakeId,
        expectedStateVersion: created.stateVersion,
      }),
    });
    const source = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: briefed.stateVersion,
      label: "invented-snapshot-source",
    });
    const admitted = await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: source.command,
      bytes: source.bytes,
    });
    const retained = await prisma.constructionProjectBrainSource.findFirstOrThrow({
      where: { intakeId: created.intakeId },
    });
    const commandId = crypto.randomUUID();
    const commandHash = "a".repeat(64);
    const nextStateVersion = admitted.stateVersion + 1;
    const inventedSnapshot = {
      schemaVersion: 1,
      project: { id: fixture.projectId, code: fixture.projectCode, name: fixture.projectName },
      ownerBrief: { ...ownerBrief, summary: "Invented by raw SQL.", provenance: "OWNER_CONFIRMED" },
      sources: [{
        sourceId: retained.id,
        kind: retained.kind,
        displayName: retained.displayName,
        contentHash: retained.contentHash,
        transcriptionState: retained.transcriptionState,
        documentUnderstandingState: retained.documentUnderstandingState,
      }],
      limitations: ["DOCUMENT_CONTENT_NOT_INTERPRETED"],
    };
    const reviewFingerprint = hashProjectBrainCommand(inventedSnapshot);

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "ConstructionProjectBrainIntake"
        SET "status" = 'READY_FOR_REVIEW', "stateVersion" = ${nextStateVersion},
            "reviewFingerprint" = ${reviewFingerprint}, "submittedAt" = NOW(),
            "updatedAt" = NOW()
        WHERE "id" = ${created.intakeId}
      `;
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainSnapshot" (
          "id", "workspaceId", "projectId", "intakeId", "stateVersion",
          "status", "snapshot", "canonicalHash", "createdByUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${created.intakeId}, ${nextStateVersion}, 'PROPOSED',
          CAST(${JSON.stringify(inventedSnapshot)} AS JSONB), ${reviewFingerprint}, ${fixture.ownerId}
        )
      `;
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainDecision" (
          "id", "workspaceId", "projectId", "intakeId", "commandId",
          "commandHash", "decision", "priorStateVersion", "nextStateVersion",
          "snapshotHash", "result", "resultHash", "actorUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${created.intakeId}, ${commandId}, ${commandHash}, 'SUBMIT_FOR_REVIEW',
          ${admitted.stateVersion}, ${nextStateVersion}, ${reviewFingerprint},
          CAST(${JSON.stringify({ attemptedBypass: "invented-owner-brief" })} AS JSONB),
          ${"c".repeat(64)}, ${fixture.ownerId}
        )
      `;
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    })).rejects.toThrow(/must exactly match its relational intake and sources/u);

    await expect(prisma.constructionProjectBrainIntake.findUniqueOrThrow({
      where: { id: created.intakeId },
    })).resolves.toMatchObject({ stateVersion: admitted.stateVersion, status: "DRAFT" });
    expect(await prisma.constructionProjectBrainSnapshot.count({
      where: { intakeId: created.intakeId },
    })).toBe(0);
  });

  it("refuses an exact relational snapshot carrying an arbitrary canonical fingerprint", async () => {
    const fixture = await setup("ATOMIC-SNAPSHOT-HASH");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const briefed = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: briefCommand({ fixture, intakeId: created.intakeId, expectedStateVersion: created.stateVersion }),
    });
    const source = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: briefed.stateVersion,
      label: "snapshot-hash-source",
    });
    const admitted = await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: source.command,
      bytes: source.bytes,
    });
    const retained = await prisma.constructionProjectBrainSource.findFirstOrThrow({
      where: { intakeId: created.intakeId },
    });
    const exactSnapshot = {
      schemaVersion: 1,
      project: { id: fixture.projectId, code: fixture.projectCode, name: fixture.projectName },
      ownerBrief: { ...ownerBrief, provenance: "OWNER_CONFIRMED" },
      sources: [{
        sourceId: retained.id,
        kind: retained.kind,
        displayName: retained.displayName,
        contentHash: retained.contentHash,
        transcriptionState: retained.transcriptionState,
        documentUnderstandingState: retained.documentUnderstandingState,
      }],
      limitations: ["DOCUMENT_CONTENT_NOT_INTERPRETED"],
    };
    const correctFingerprint = hashProjectBrainCommand(exactSnapshot);
    const arbitraryFingerprint = correctFingerprint === "d".repeat(64) ? "e".repeat(64) : "d".repeat(64);
    const commandId = crypto.randomUUID();
    const nextStateVersion = admitted.stateVersion + 1;

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "ConstructionProjectBrainIntake"
        SET "status" = 'READY_FOR_REVIEW', "stateVersion" = ${nextStateVersion},
            "reviewFingerprint" = ${arbitraryFingerprint}, "submittedAt" = NOW(),
            "updatedAt" = NOW()
        WHERE "id" = ${created.intakeId}
      `;
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainSnapshot" (
          "id", "workspaceId", "projectId", "intakeId", "stateVersion",
          "status", "snapshot", "canonicalHash", "createdByUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${created.intakeId}, ${nextStateVersion}, 'PROPOSED',
          CAST(${JSON.stringify(exactSnapshot)} AS JSONB), ${arbitraryFingerprint}, ${fixture.ownerId}
        )
      `;
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainDecision" (
          "id", "workspaceId", "projectId", "intakeId", "commandId",
          "commandHash", "decision", "priorStateVersion", "nextStateVersion",
          "snapshotHash", "result", "resultHash", "actorUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${created.intakeId}, ${commandId}, ${"e".repeat(64)}, 'SUBMIT_FOR_REVIEW',
          ${admitted.stateVersion}, ${nextStateVersion}, ${arbitraryFingerprint},
          CAST(${JSON.stringify({ attemptedBypass: "arbitrary-canonical-hash" })} AS JSONB),
          ${"f".repeat(64)}, ${fixture.ownerId}
        )
      `;
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    })).rejects.toThrow(/canonical fingerprint mismatch/u);

    await expect(prisma.constructionProjectBrainIntake.findUniqueOrThrow({
      where: { id: created.intakeId },
    })).resolves.toMatchObject({ stateVersion: admitted.stateVersion, status: "DRAFT" });
  });

  it("refuses binding a Project Brain source to a File owned by another tenant", async () => {
    const sourceFixture = await setup("ATOMIC-FILE-SOURCE-TENANT");
    const sourceCreated = await processProjectBrainIntakeCommand({
      userId: sourceFixture.ownerId,
      command: createCommand(sourceFixture),
    });
    const source = sourceCommand({
      fixture: sourceFixture,
      intakeId: sourceCreated.intakeId,
      expectedStateVersion: sourceCreated.stateVersion,
      label: "tenant-source-file",
    });
    await admitProjectBrainSource({
      userId: sourceFixture.ownerId,
      command: source.command,
      bytes: source.bytes,
    });
    const retained = await prisma.constructionProjectBrainSource.findFirstOrThrow({
      where: { intakeId: sourceCreated.intakeId },
      include: { file: true },
    });

    const targetFixture = await setup("ATOMIC-FILE-TARGET-TENANT");
    const targetCreated = await processProjectBrainIntakeCommand({
      userId: targetFixture.ownerId,
      command: createCommand(targetFixture),
    });
    const commandId = crypto.randomUUID();
    const commandHash = "2".repeat(64);

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "ConstructionProjectBrainIntake"
        SET "stateVersion" = 2, "updatedAt" = NOW()
        WHERE "id" = ${targetCreated.intakeId}
      `;
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainSource" (
          "id", "workspaceId", "projectId", "intakeId", "commandId",
          "commandHash", "kind", "fileId", "contentHash", "displayName",
          "mimeType", "sizeBytes", "durationMs", "ordinal", "createdByUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${targetFixture.workspaceId}, ${targetFixture.projectId},
          ${targetCreated.intakeId}, ${commandId}, ${commandHash}, 'DOCUMENT',
          ${retained.fileId}, ${retained.contentHash}, ${retained.displayName},
          ${retained.mimeType}, ${retained.sizeBytes}, NULL, 1, ${targetFixture.ownerId}
        )
      `;
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainDecision" (
          "id", "workspaceId", "projectId", "intakeId", "commandId",
          "commandHash", "decision", "priorStateVersion", "nextStateVersion",
          "snapshotHash", "result", "resultHash", "actorUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${targetFixture.workspaceId}, ${targetFixture.projectId},
          ${targetCreated.intakeId}, ${commandId}, ${commandHash}, 'ADMIT_SOURCE', 1, 2, NULL,
          CAST(${JSON.stringify({ attemptedBypass: "cross-tenant-file-binding" })} AS JSONB),
          ${"3".repeat(64)}, ${targetFixture.ownerId}
        )
      `;
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    })).rejects.toThrow(/File provenance mismatch/u);

    expect(await prisma.constructionProjectBrainSource.count({
      where: { intakeId: targetCreated.intakeId },
    })).toBe(0);
    await expect(prisma.constructionProjectBrainIntake.findUniqueOrThrow({
      where: { id: targetCreated.intakeId },
    })).resolves.toMatchObject({ stateVersion: 1, status: "DRAFT" });
  });

  it("refuses an otherwise atomic ADMIT_SOURCE chain whose Source metadata disagrees with its File", async () => {
    const fixture = await setup("ATOMIC-FILE-METADATA");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const original = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: created.stateVersion,
      label: "metadata-source-file",
    });
    const admitted = await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: original.command,
      bytes: original.bytes,
    });
    const retained = await prisma.constructionProjectBrainSource.findFirstOrThrow({
      where: { intakeId: created.intakeId },
      include: { file: true },
    });
    const commandId = crypto.randomUUID();
    const commandHash = "4".repeat(64);

    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "ConstructionProjectBrainIntake"
        SET "stateVersion" = ${admitted.stateVersion + 1}, "updatedAt" = NOW()
        WHERE "id" = ${created.intakeId}
      `;
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainSource" (
          "id", "workspaceId", "projectId", "intakeId", "commandId",
          "commandHash", "kind", "fileId", "contentHash", "displayName",
          "mimeType", "sizeBytes", "durationMs", "ordinal", "createdByUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${created.intakeId}, ${commandId}, ${commandHash}, 'DOCUMENT',
          ${retained.fileId}, ${"5".repeat(64)}, ${retained.displayName},
          ${retained.mimeType}, ${retained.sizeBytes}, NULL, 2, ${fixture.ownerId}
        )
      `;
      await tx.$executeRaw`
        INSERT INTO "ConstructionProjectBrainDecision" (
          "id", "workspaceId", "projectId", "intakeId", "commandId",
          "commandHash", "decision", "priorStateVersion", "nextStateVersion",
          "snapshotHash", "result", "resultHash", "actorUserId"
        ) VALUES (
          ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
          ${created.intakeId}, ${commandId}, ${commandHash}, 'ADMIT_SOURCE',
          ${admitted.stateVersion}, ${admitted.stateVersion + 1}, NULL,
          CAST(${JSON.stringify({ attemptedBypass: "mismatched-source-file-metadata" })} AS JSONB),
          ${"6".repeat(64)}, ${fixture.ownerId}
        )
      `;
      await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
    })).rejects.toThrow(/File provenance mismatch/u);

    expect(await prisma.constructionProjectBrainSource.count({
      where: { intakeId: created.intakeId },
    })).toBe(1);
    await expect(prisma.constructionProjectBrainIntake.findUniqueOrThrow({
      where: { id: created.intakeId },
    })).resolves.toMatchObject({ stateVersion: admitted.stateVersion, status: "DRAFT" });
  });

  it("retains admitted source bytes beyond the generic orphan-file window", async () => {
    const fixture = await setup("SOURCE-RETENTION");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const source = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: created.stateVersion,
      label: "retained-plan",
    });
    await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: source.command,
      bytes: source.bytes,
    });
    const admitted = await prisma.constructionProjectBrainSource.findFirstOrThrow({
      where: { intakeId: created.intakeId },
      include: { file: { select: { id: true, storageKey: true } } },
    });
    const realNow = Date.now();
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(
      realNow + 48 * 60 * 60 * 1_000,
    );
    try {
      expect(await reapOrphanFiles()).toBe(0);
    } finally {
      dateNow.mockRestore();
    }
    await expect(prisma.file.findUniqueOrThrow({
      where: { id: admitted.file.id },
    })).resolves.toMatchObject({ storageKey: admitted.file.storageKey });
    expect(await localObjectExists(admitted.file.storageKey)).toBe(true);
  });

  it("represents distinct identical-byte selections with one canonical stored file", async () => {
    const fixture = await setup("IDENTICAL-BYTES");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const bytes = pdf("same-owner-selected-bytes");
    const first = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: created.stateVersion,
      label: "first-name",
    });
    const admittedFirst = await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: { ...first.command, sizeBytes: bytes.length },
      bytes,
    });
    const second = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: admittedFirst.stateVersion,
      label: "second-name",
    });
    const admittedSecond = await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: { ...second.command, sizeBytes: bytes.length },
      bytes,
    });

    const selections = await prisma.constructionProjectBrainSource.findMany({
      where: { intakeId: created.intakeId },
      orderBy: { ordinal: "asc" },
      select: { displayName: true, fileId: true, contentHash: true, ordinal: true },
    });
    expect(selections).toHaveLength(2);
    expect(selections.map((selection) => selection.displayName)).toEqual([
      "first-name.pdf",
      "second-name.pdf",
    ]);
    expect(new Set(selections.map((selection) => selection.fileId)).size).toBe(1);
    expect(new Set(selections.map((selection) => selection.contentHash)).size).toBe(1);
    expect(admittedSecond.stateVersion).toBe(admittedFirst.stateVersion + 1);
    expect(await prisma.file.count({
      where: { id: { in: selections.map((selection) => selection.fileId) } },
    })).toBe(1);
    expect(await prisma.fileAccessLog.count({
      where: { fileId: selections[0].fileId, action: "upload" },
    })).toBe(1);
    expect(await prisma.constructionProjectBrainDecision.count({
      where: { intakeId: created.intakeId, decision: "ADMIT_SOURCE" },
    })).toBe(2);
    const downloadedSecond = await projectBrainSourceBytesForUser({
      userId: fixture.ownerId,
      sourceId: (await prisma.constructionProjectBrainSource.findFirstOrThrow({
        where: { intakeId: created.intakeId, ordinal: 2 },
        select: { id: true },
      })).id,
    });
    expect(downloadedSecond.fileName).toBe("second-name.pdf");
    expect(downloadedSecond.bytes.equals(bytes)).toBe(true);
    expect(await prisma.fileAccessLog.count({
      where: { fileId: selections[0].fileId, action: "download" },
    })).toBe(1);
    const protectedSourceId = (await prisma.constructionProjectBrainSource.findFirstOrThrow({
      where: { intakeId: created.intakeId, ordinal: 2 },
      select: { id: true },
    })).id;
    for (const deniedUserId of [fixture.fieldId, fixture.inactiveId, fixture.outsiderId]) {
      await expect(projectBrainSourceBytesForUser({
        userId: deniedUserId,
        sourceId: protectedSourceId,
      })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    }
    expect(await prisma.fileAccessLog.count({
      where: { fileId: selections[0].fileId, action: "download" },
    })).toBe(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("binds source idempotency to raw and retained bytes after metadata stripping", async () => {
    const fixture = await setup("RAW-BYTE-BINDING");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const firstBytes = jpegWithApp1("camera-a");
    const driftedRawBytes = jpegWithApp1("camera-b");
    expect(firstBytes).toHaveLength(driftedRawBytes.length);
    expect(firstBytes.equals(driftedRawBytes)).toBe(false);
    const command = {
      schemaVersion: 1 as const,
      action: "ADMIT_PROJECT_BRAIN_SOURCE" as const,
      commandId: crypto.randomUUID(),
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
      intakeId: created.intakeId,
      expectedStateVersion: created.stateVersion,
      kind: "PHOTO" as const,
      fileName: "site.jpg",
      mimeType: "image/jpeg" as const,
      sizeBytes: firstBytes.length,
      durationMs: null,
    };
    const admitted = await admitProjectBrainSource({
      userId: fixture.ownerId,
      command,
      bytes: firstBytes,
    });
    expect(admitted.replayed).toBe(false);
    await expect(admitProjectBrainSource({
      userId: fixture.ownerId,
      command,
      bytes: driftedRawBytes,
    })).rejects.toThrow("PROJECT_BRAIN_IDEMPOTENCY_CONFLICT");
    expect(await prisma.constructionProjectBrainSource.count({
      where: { intakeId: created.intakeId },
    })).toBe(1);
  });

  it("heals a missing canonical blob and refuses a corrupt canonical blob before reuse", async () => {
    const fixture = await setup("CANONICAL-BLOB-VERIFY");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const bytes = pdf("canonical-blob");
    const first = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: created.stateVersion,
      label: "canonical-first",
    });
    const admittedFirst = await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: { ...first.command, sizeBytes: bytes.length },
      bytes,
    });
    const canonical = await prisma.constructionProjectBrainSource.findFirstOrThrow({
      where: { intakeId: created.intakeId, ordinal: 1 },
      include: { file: { select: { id: true, storageKey: true } } },
    });

    await deleteLocalObject(canonical.file.storageKey);
    const second = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: admittedFirst.stateVersion,
      label: "canonical-second",
    });
    const admittedSecond = await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: { ...second.command, sizeBytes: bytes.length },
      bytes,
    });
    expect(admittedSecond.stateVersion).toBe(admittedFirst.stateVersion + 1);
    expect(await localObjectExists(canonical.file.storageKey)).toBe(true);

    await deleteLocalObject(canonical.file.storageKey);
    await putLocalObject(canonical.file.storageKey, Buffer.from("corrupt canonical bytes"));
    const third = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: admittedSecond.stateVersion,
      label: "canonical-third",
    });
    await expect(admitProjectBrainSource({
      userId: fixture.ownerId,
      command: { ...third.command, sizeBytes: bytes.length },
      bytes,
    })).rejects.toThrow("PROJECT_BRAIN_SOURCE_STORAGE_CORRUPT");
    expect(await prisma.constructionProjectBrainSource.count({
      where: { intakeId: created.intakeId },
    })).toBe(2);
    expect(await prisma.constructionProjectBrainDecision.count({
      where: { workspaceId: fixture.workspaceId, commandId: third.command.commandId },
    })).toBe(0);

    await deleteLocalObject(canonical.file.storageKey);
    await putLocalObject(canonical.file.storageKey, bytes);
  });

  it("reconciles every stale crash remnant while retaining referenced source bytes", async () => {
    const fixture = await setup("CRASH-RECONCILIATION");
    const orphanKey = [
      "project-brain-intake",
      "crash-workspace",
      "crash-project",
      "crash-intake",
      `${crypto.randomUUID()}-${"a".repeat(64)}.pdf`,
    ].join("/");
    const temporaryKey = [
      "project-brain-intake",
      "crash-workspace",
      "crash-project",
      "crash-intake",
      `${crypto.randomUUID()}.tmp`,
    ].join("/");
    const unreferencedFileKey = [
      "project-brain-intake",
      fixture.workspaceId,
      fixture.projectId,
      "unreferenced-intake",
      `${crypto.randomUUID()}-${"b".repeat(64)}.pdf`,
    ].join("/");
    await putLocalObject(orphanKey, pdf("crash-before-database-commit"));
    await putLocalObject(temporaryKey, pdf("temporary-crash-remnant"));
    const unreferencedBytes = pdf("unreferenced-file-row");
    await putLocalObject(unreferencedFileKey, unreferencedBytes);
    const unreferencedFile = await prisma.file.create({
      data: {
        kind: "input",
        uploaderId: fixture.ownerId,
        storageKey: unreferencedFileKey,
        fileName: "unreferenced.pdf",
        mime: "application/pdf",
        sizeBytes: unreferencedBytes.length,
        scanStatus: "pending",
        detectedMime: "application/pdf",
        sha256: "b".repeat(64),
        scanDetails: "LOCAL_TEST_UNREFERENCED",
      },
    });
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const source = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: created.stateVersion,
      label: "referenced-crash-retention",
    });
    await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: source.command,
      bytes: source.bytes,
    });
    const referenced = await prisma.constructionProjectBrainSource.findFirstOrThrow({
      where: { intakeId: created.intakeId },
      include: { file: { select: { id: true, storageKey: true } } },
    });
    expect(await localObjectExists(orphanKey)).toBe(true);
    expect(await localObjectExists(temporaryKey)).toBe(true);
    expect(await localObjectExists(unreferencedFileKey)).toBe(true);
    expect(await localObjectExists(referenced.file.storageKey)).toBe(true);

    let removed = 0;
    const cleanupNow = new Date(Date.now() + 25 * 60 * 60 * 1_000);
    for (let batch = 0; batch < 128; batch += 1) {
      removed += await reconcileProjectBrainLocalObjects(cleanupNow);
      if (
        !await localObjectExists(orphanKey)
        && !await localObjectExists(temporaryKey)
        && !await localObjectExists(unreferencedFileKey)
      ) break;
    }
    expect(removed).toBeGreaterThanOrEqual(3);
    expect(await localObjectExists(orphanKey)).toBe(false);
    expect(await localObjectExists(temporaryKey)).toBe(false);
    expect(await localObjectExists(unreferencedFileKey)).toBe(false);
    expect(await localObjectExists(referenced.file.storageKey)).toBe(true);
    expect(await prisma.file.count({ where: { storageKey: orphanKey } })).toBe(0);
    expect(await prisma.file.count({ where: { id: unreferencedFile.id } })).toBe(0);
    expect(await prisma.file.count({ where: { id: referenced.file.id } })).toBe(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("freezes the owner brief at review and every reviewed field at adjudication", async () => {
    const fixture = await setup("REVIEW-FREEZE");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const briefed = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: briefCommand({
        fixture,
        intakeId: created.intakeId,
        expectedStateVersion: created.stateVersion,
      }),
    });

    await expect(prisma.$executeRaw`
      UPDATE "ConstructionProjectBrainIntake"
      SET "summary" = 'mutated while entering review',
          "status" = 'READY_FOR_REVIEW',
          "stateVersion" = "stateVersion" + 1,
          "reviewFingerprint" = ${"0".repeat(64)},
          "submittedAt" = NOW()
      WHERE "id" = ${created.intakeId}
    `).rejects.toThrow(/owner brief must be frozen before review/u);

    const source = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: briefed.stateVersion,
      label: "review-freeze-plan",
    });
    const admitted = await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: source.command,
      bytes: source.bytes,
    });
    const submitted = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: submitCommand({
        fixture,
        intakeId: created.intakeId,
        expectedStateVersion: admitted.stateVersion,
      }),
    });

    await expect(prisma.$executeRaw`
      UPDATE "ConstructionProjectBrainIntake"
      SET "summary" = 'mutated after review',
          "status" = 'CONFIRMED',
          "stateVersion" = "stateVersion" + 1,
          "confirmedAt" = NOW()
      WHERE "id" = ${created.intakeId}
    `).rejects.toThrow(/reviewed state is immutable/u);
    await expect(prisma.constructionProjectBrainIntake.findUniqueOrThrow({
      where: { id: created.intakeId },
    })).resolves.toMatchObject({
      summary: ownerBrief.summary,
      status: "READY_FOR_REVIEW",
      stateVersion: submitted.stateVersion,
      reviewFingerprint: submitted.reviewFingerprint,
    });
  });

  it("creates, briefs, admits multiple sources, reviews and atomically confirms exact memory", async () => {
    const fixture = await setup("HAPPY");
    const { created, stateVersion } = await createBriefAndSources(fixture, "happy");

    const submitted = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: {
        schemaVersion: 1,
        action: "SUBMIT_PROJECT_BRAIN_INTAKE",
        commandId: crypto.randomUUID(),
        workspaceId: fixture.workspaceId,
        projectId: fixture.projectId,
        intakeId: created.intakeId,
        expectedStateVersion: stateVersion,
      },
    });
    expect(submitted).toMatchObject({
      status: "READY_FOR_REVIEW",
      stateVersion: stateVersion + 1,
      reviewFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
      providerExecutionPerformed: false,
      externalTransportPerformed: false,
    });

    const driftCountBefore = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count
      FROM "ConstructionProjectBrainSnapshot"
      WHERE "intakeId" = ${created.intakeId}
    `;
    await expect(processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: {
        schemaVersion: 1,
        action: "CONFIRM_PROJECT_BRAIN_INTAKE",
        commandId: crypto.randomUUID(),
        workspaceId: fixture.workspaceId,
        projectId: fixture.projectId,
        intakeId: created.intakeId,
        expectedStateVersion: submitted.stateVersion,
        reviewFingerprint: "f".repeat(64),
      },
    })).rejects.toThrow("PROJECT_BRAIN_REVIEW_FINGERPRINT_CONFLICT");
    const driftCountAfter = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count
      FROM "ConstructionProjectBrainSnapshot"
      WHERE "intakeId" = ${created.intakeId}
    `;
    expect(driftCountAfter[0].count).toBe(driftCountBefore[0].count);

    const confirmCommand = {
      schemaVersion: 1 as const,
      action: "CONFIRM_PROJECT_BRAIN_INTAKE" as const,
      commandId: crypto.randomUUID(),
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
      intakeId: created.intakeId,
      expectedStateVersion: submitted.stateVersion,
      reviewFingerprint: submitted.reviewFingerprint!,
    };
    const confirmed = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: confirmCommand,
    });
    expect(confirmed).toMatchObject({
      status: "CONFIRMED",
      stateVersion: submitted.stateVersion + 1,
      replayed: false,
      providerExecutionPerformed: false,
      externalTransportPerformed: false,
    });

    const atomicRows = await prisma.$queryRaw<Array<{
      confirmedSnapshots: bigint;
      confirmDecisions: bigint;
    }>>`
      SELECT
        (SELECT count(*) FROM "ConstructionProjectBrainSnapshot" WHERE "intakeId" = ${created.intakeId} AND "status" = 'CONFIRMED')::bigint AS "confirmedSnapshots",
        (SELECT count(*) FROM "ConstructionProjectBrainDecision" WHERE "intakeId" = ${created.intakeId} AND "decision" = 'CONFIRM_EXACT')::bigint AS "confirmDecisions"
    `;
    expect(atomicRows[0]).toEqual({ confirmedSnapshots: 1n, confirmDecisions: 1n });

    const projection = await projectBrainIntakeProjectionForUser({
      userId: fixture.ownerId,
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
    });
    expect(projection).toMatchObject({
      intake: {
        id: created.intakeId,
        status: "CONFIRMED",
        ownerBrief,
        sources: [
          { ordinal: 1, kind: "DOCUMENT" },
          { ordinal: 2, kind: "PHOTO" },
          { ordinal: 3, kind: "PHOTO" },
          { ordinal: 4, kind: "VOICE_NOTE", durationMs: 256 },
        ],
      },
      limitations: ["VOICE_NOT_TRANSCRIBED", "DOCUMENT_CONTENT_NOT_INTERPRETED"],
      providerExecutionPerformed: false,
      externalTransportPerformed: false,
    });
    expect(JSON.stringify(projection)).not.toContain('"transcript":');
    expect(JSON.stringify(projection)).not.toContain('"extractedText":');

    const immutableSourceId = projection.intake!.sources[0].id;
    const immutableSnapshotId = projection.intake!.snapshots.find(
      (snapshot) => snapshot.status === "CONFIRMED",
    )!.id;
    const immutableDecisionId = projection.intake!.decisions.find(
      (decision) => decision.decision === "CONFIRM_EXACT",
    )!.id;
    await expect(prisma.$executeRaw`
      UPDATE "ConstructionProjectBrainSource"
      SET "displayName" = 'rewritten.pdf'
      WHERE "id" = ${immutableSourceId}
    `).rejects.toThrow(/immutable and append-only/u);
    await expect(prisma.$executeRaw`
      DELETE FROM "ConstructionProjectBrainSnapshot"
      WHERE "id" = ${immutableSnapshotId}
    `).rejects.toThrow(/immutable and append-only/u);
    await expect(prisma.$executeRaw`
      UPDATE "ConstructionProjectBrainDecision"
      SET "resultHash" = ${"0".repeat(64)}
      WHERE "id" = ${immutableDecisionId}
    `).rejects.toThrow(/immutable and append-only/u);
    await expect(prisma.$executeRaw`
      UPDATE "ConstructionProjectBrainIntake"
      SET "projectId" = ${fixture.otherProjectId},
          "stateVersion" = "stateVersion" + 1
      WHERE "id" = ${created.intakeId}
    `).rejects.toThrow(/identity and provenance are immutable/u);
    await expect(prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "ConstructionProjectBrainSource"',
    )).rejects.toThrow(/immutable and append-only/u);

    const projectionAfterMutationAttempts = await projectBrainIntakeProjectionForUser({
      userId: fixture.ownerId,
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
    });
    expect(projectionAfterMutationAttempts).toEqual(projection);

    const blockerRequest = {
      schemaVersion: 1 as const,
      requestId: crypto.randomUUID(),
      workspaceId: fixture.workspaceId,
      message: `Quels sont les blocages pour ${fixture.projectCode}?`,
      occurredAt: "2026-09-03T18:00:00.000Z",
    };
    const blockerAnswer = await processUnifiedAssistantRequest({
      userId: fixture.ownerId,
      channel: "MOBILE_APP",
      request: blockerRequest,
    });
    const blockerReplay = await processUnifiedAssistantRequest({
      userId: fixture.ownerId,
      channel: "MOBILE_APP",
      request: blockerRequest,
    });
    expect(blockerAnswer).toMatchObject({
      intent: "PROJECT_BRAIN_QUERY",
      status: "ANSWERED",
      replayed: false,
      reply: expect.stringContaining(ownerBrief.blockers),
      routing: {
        intentClass: "CANONICAL_STATE_QUERY",
        capabilityKey: "CANONICAL_STATE",
        disposition: "INTERNAL_TOOL",
        providerExecutionAuthorized: false,
        externalDispatchPerformed: false,
      },
    });
    expect(blockerReplay).toMatchObject({
      messageId: blockerAnswer.messageId,
      assistantMessageId: blockerAnswer.assistantMessageId,
      reply: blockerAnswer.reply,
      replayed: true,
    });

    const binaryAnswer = await processUnifiedAssistantRequest({
      userId: fixture.ownerId,
      channel: "MOBILE_APP",
      request: {
        ...blockerRequest,
        requestId: crypto.randomUUID(),
        message: `Transcris la note vocale du chantier ${fixture.projectCode}.`,
      },
    });
    expect(binaryAnswer).toMatchObject({
      intent: "PROJECT_BRAIN_QUERY",
      status: "REFUSED",
      routing: {
        intentClass: "DOCUMENT_UNDERSTANDING",
        disposition: "REFUSED",
        providerExecutionAuthorized: false,
        externalDispatchPerformed: false,
      },
    });
    expect(binaryAnswer.reply).toContain("n’a pas été transcrit");
    expect(binaryAnswer.reply).not.toContain(ownerBrief.blockers);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("replays exact command bodies, refuses drift and hides cross-workspace resources", async () => {
    const fixture = await setup("REPLAY-A");
    const other = await setup("REPLAY-B");
    const command = createCommand(fixture, "36360000-0000-4000-8000-000000000101");
    const created = await processProjectBrainIntakeCommand({ userId: fixture.ownerId, command });
    const replayed = await processProjectBrainIntakeCommand({ userId: fixture.ownerId, command });
    expect(replayed).toMatchObject({
      intakeId: created.intakeId,
      canonicalEffectId: created.canonicalEffectId,
      stateVersion: created.stateVersion,
      replayed: true,
    });

    await expect(processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: { ...command, projectId: fixture.otherProjectId },
    })).rejects.toThrow("PROJECT_BRAIN_IDEMPOTENCY_CONFLICT");

    await expect(processProjectBrainIntakeCommand({
      userId: fixture.outsiderId,
      command: createCommand(fixture),
    })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    await expect(processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: {
        ...createCommand(fixture),
        projectId: other.projectId,
      },
    })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");

    await expect(projectBrainIntakeProjectionForUser({
      userId: fixture.outsiderId,
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
    })).rejects.toThrow("CONSTRUCTION_RESOURCE_NOT_FOUND");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does not manufacture refusal audit rows for an invented intake", async () => {
    const fixture = await setup("INVENTED-INTAKE-REFUSAL");
    const bytes = pdf("invalid-size-before-preflight");
    const intakeId = crypto.randomUUID();
    const commandId = crypto.randomUUID();
    await expect(admitProjectBrainSource({
      userId: fixture.ownerId,
      command: {
        schemaVersion: 1,
        action: "ADMIT_PROJECT_BRAIN_SOURCE",
        commandId,
        workspaceId: fixture.workspaceId,
        projectId: fixture.projectId,
        intakeId,
        expectedStateVersion: 1,
        kind: "DOCUMENT",
        fileName: "invalid.pdf",
        mimeType: "application/pdf",
        sizeBytes: bytes.length + 1,
        durationMs: null,
      },
      bytes,
    })).rejects.toThrow("selected file size is invalid");
    expect(await prisma.constructionAuditEvent.count({
      where: {
        workspaceId: fixture.workspaceId,
        entityType: "project_brain_intake",
        entityId: intakeId,
        action: "project_brain_command_refused",
      },
    })).toBe(0);
  });

  it("replays BRIEF, SOURCE, SUBMIT, CONFIRM and REJECT without duplicating canonical rows", async () => {
    const fixture = await setup("FULL-REPLAY");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });

    const brief = briefCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: created.stateVersion,
      commandId: crypto.randomUUID(),
    });
    const briefed = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: brief,
    });
    await expectStableReplayAndDrift({
      fixture,
      original: briefed,
      replay: () => processProjectBrainIntakeCommand({ userId: fixture.ownerId, command: brief }),
      drift: () => processProjectBrainIntakeCommand({
        userId: fixture.ownerId,
        command: {
          ...brief,
          brief: { ...brief.brief, summary: "Corps différent sous le même commandId." },
        },
      }),
    });

    const source = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: briefed.stateVersion,
      commandId: crypto.randomUUID(),
      label: "full-replay-source",
    });
    const admitted = await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: source.command,
      bytes: source.bytes,
    });
    await expectStableReplayAndDrift({
      fixture,
      original: admitted,
      replay: () => admitProjectBrainSource({
        userId: fixture.ownerId,
        command: source.command,
        bytes: source.bytes,
      }),
      drift: () => admitProjectBrainSource({
        userId: fixture.ownerId,
        command: { ...source.command, fileName: "full-replay-drift.pdf" },
        bytes: source.bytes,
      }),
    });

    const submit = submitCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: admitted.stateVersion,
      commandId: crypto.randomUUID(),
    });
    const submitted = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: submit,
    });
    await expectStableReplayAndDrift({
      fixture,
      original: submitted,
      replay: () => processProjectBrainIntakeCommand({ userId: fixture.ownerId, command: submit }),
      drift: () => processProjectBrainIntakeCommand({
        userId: fixture.ownerId,
        command: { ...submit, expectedStateVersion: submit.expectedStateVersion + 1 },
      }),
    });

    const confirm = confirmCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: submitted.stateVersion,
      reviewFingerprint: submitted.reviewFingerprint!,
      commandId: crypto.randomUUID(),
    });
    const confirmed = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: confirm,
    });
    const confirmDriftFingerprint = `${confirm.reviewFingerprint[0] === "0" ? "1" : "0"}${confirm.reviewFingerprint.slice(1)}`;
    await expectStableReplayAndDrift({
      fixture,
      original: confirmed,
      replay: () => processProjectBrainIntakeCommand({ userId: fixture.ownerId, command: confirm }),
      drift: () => processProjectBrainIntakeCommand({
        userId: fixture.ownerId,
        command: { ...confirm, reviewFingerprint: confirmDriftFingerprint },
      }),
    });

    const secondCreated = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const secondBriefed = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: briefCommand({
        fixture,
        intakeId: secondCreated.intakeId,
        expectedStateVersion: secondCreated.stateVersion,
      }),
    });
    const secondSource = sourceCommand({
      fixture,
      intakeId: secondCreated.intakeId,
      expectedStateVersion: secondBriefed.stateVersion,
      label: "full-replay-reject-source",
    });
    const secondAdmitted = await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: secondSource.command,
      bytes: secondSource.bytes,
    });
    const secondSubmitted = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: submitCommand({
        fixture,
        intakeId: secondCreated.intakeId,
        expectedStateVersion: secondAdmitted.stateVersion,
      }),
    });
    const reject = rejectCommand({
      fixture,
      intakeId: secondCreated.intakeId,
      expectedStateVersion: secondSubmitted.stateVersion,
      reviewFingerprint: secondSubmitted.reviewFingerprint!,
      commandId: crypto.randomUUID(),
    });
    const rejected = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: reject,
    });
    const rejectDriftFingerprint = `${reject.reviewFingerprint[0] === "0" ? "1" : "0"}${reject.reviewFingerprint.slice(1)}`;
    await expectStableReplayAndDrift({
      fixture,
      original: rejected,
      replay: () => processProjectBrainIntakeCommand({ userId: fixture.ownerId, command: reject }),
      drift: () => processProjectBrainIntakeCommand({
        userId: fixture.ownerId,
        command: { ...reject, reviewFingerprint: rejectDriftFingerprint },
      }),
    });

    expect(await projectBrainPersistenceCounts(fixture)).toEqual({
      intakes: 2,
      sources: 2,
      snapshots: 3,
      decisions: 10,
      audits: 20,
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("opens the next monotonic intake sequence after an exact rejection", async () => {
    const fixture = await setup("REJECT-SEQUENCE");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const briefed = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: briefCommand({
        fixture,
        intakeId: created.intakeId,
        expectedStateVersion: created.stateVersion,
      }),
    });
    const source = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: briefed.stateVersion,
      label: "reject-sequence-source",
    });
    const admitted = await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: source.command,
      bytes: source.bytes,
    });
    const submitted = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: submitCommand({
        fixture,
        intakeId: created.intakeId,
        expectedStateVersion: admitted.stateVersion,
      }),
    });
    const rejected = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: rejectCommand({
        fixture,
        intakeId: created.intakeId,
        expectedStateVersion: submitted.stateVersion,
        reviewFingerprint: submitted.reviewFingerprint!,
      }),
    });
    expect(rejected).toMatchObject({ status: "REJECTED", stateVersion: 5 });

    const next = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    expect(next).toMatchObject({
      status: "DRAFT",
      stateVersion: 1,
    });
    expect(next.intakeId).not.toBe(created.intakeId);

    const retained = await prisma.constructionProjectBrainIntake.findMany({
      where: { workspaceId: fixture.workspaceId, projectId: fixture.projectId },
      orderBy: { intakeSequence: "asc" },
      select: { id: true, intakeSequence: true, status: true, stateVersion: true },
    });
    expect(retained).toEqual([
      { id: created.intakeId, intakeSequence: 1, status: "REJECTED", stateVersion: 5 },
      { id: next.intakeId, intakeSequence: 2, status: "DRAFT", stateVersion: 1 },
    ]);
    await expect(projectBrainIntakeProjectionForUser({
      userId: fixture.officeId,
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
    })).resolves.toMatchObject({
      intake: { id: next.intakeId, intakeSequence: 2, status: "DRAFT" },
    });
  });

  it("enforces voice duration, MIME compatibility and one voice note per intake in PostgreSQL", async () => {
    const fixture = await setup("SOURCE-CHECKS");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const briefed = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: briefCommand({
        fixture,
        intakeId: created.intakeId,
        expectedStateVersion: created.stateVersion,
      }),
    });
    const insertRawSource = (input: {
      commandId: string;
      kind: "DOCUMENT" | "PHOTO" | "VOICE_NOTE";
      mimeType: string;
      durationMs: number | null;
      ordinal: number;
    }) => prisma.$executeRaw`
      INSERT INTO "ConstructionProjectBrainSource" (
        "id", "workspaceId", "projectId", "intakeId", "commandId",
        "commandHash", "kind", "fileId", "contentHash", "displayName",
        "mimeType", "sizeBytes", "durationMs", "ordinal", "createdByUserId"
      ) VALUES (
        ${crypto.randomUUID()}, ${fixture.workspaceId}, ${fixture.projectId},
        ${created.intakeId}, ${input.commandId}, ${"a".repeat(64)}, ${input.kind},
        ${crypto.randomUUID()}, ${"b".repeat(64)}, 'synthetic-source',
        ${input.mimeType}, 32, ${input.durationMs}, ${input.ordinal}, ${fixture.ownerId}
      )
    `;

    await expect(insertRawSource({
      commandId: crypto.randomUUID(),
      kind: "VOICE_NOTE",
      mimeType: "audio/m4a",
      durationMs: 120_001,
      ordinal: 1,
    })).rejects.toThrow(/CPBS_duration_check/u);
    await expect(insertRawSource({
      commandId: crypto.randomUUID(),
      kind: "PHOTO",
      mimeType: "application/pdf",
      durationMs: null,
      ordinal: 1,
    })).rejects.toThrow(/CPBS_kind_mime_check/u);
    await expect(insertRawSource({
      commandId: crypto.randomUUID(),
      kind: "DOCUMENT",
      mimeType: "application/pdf",
      durationMs: null,
      ordinal: 21,
    })).rejects.toThrow(/CPBS_size_ordinal_check/u);

    const driftedVoice = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: briefed.stateVersion,
      label: "drifted-voice",
      kind: "VOICE_NOTE",
    });
    await expect(admitProjectBrainSource({
      userId: fixture.ownerId,
      command: { ...driftedVoice.command, durationMs: 30_000 },
      bytes: driftedVoice.bytes,
    })).rejects.toThrow("does not match the M4A audio track");

    const oversizedVoice = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: briefed.stateVersion,
      label: "oversized-voice",
      kind: "VOICE_NOTE",
    });
    await expect(admitProjectBrainSource({
      userId: fixture.ownerId,
      command: { ...oversizedVoice.command, durationMs: 120_000 },
      bytes: oversizedM4aFixture(),
    })).rejects.toThrow("exceeds the 120-second limit");

    const voice = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: briefed.stateVersion,
      label: "only-voice",
      kind: "VOICE_NOTE",
    });
    await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: { ...voice.command, durationMs: 256 },
      bytes: voice.bytes,
    });
    await expect(insertRawSource({
      commandId: crypto.randomUUID(),
      kind: "VOICE_NOTE",
      mimeType: "audio/m4a",
      durationMs: 30_000,
      ordinal: 2,
    })).rejects.toThrow(
      /23505|CPBS_one_voice_note_per_intake|Key \("intakeId"\)=.*already exists/u,
    );

    const sourceCount = await prisma.constructionProjectBrainSource.count({
      where: { intakeId: created.intakeId },
    });
    expect(sourceCount).toBe(1);
    await expect(prisma.constructionProjectBrainSource.findFirstOrThrow({
      where: { intakeId: created.intakeId, kind: "VOICE_NOTE" },
      select: { durationMs: true },
    })).resolves.toEqual({ durationMs: 256 });
  });

  it("collapses concurrent exact create/source commands and fences stale competing sources", async () => {
    const fixture = await setup("CONCURRENCY");
    const create = createCommand(fixture, "36360000-0000-4000-8000-000000000201");
    const createdResults = await Promise.all(
      Array.from({ length: 20 }, () =>
        processProjectBrainIntakeCommand({ userId: fixture.ownerId, command: create })),
    );
    expect(new Set(createdResults.map((result) => result.intakeId)).size).toBe(1);
    expect(createdResults.filter((result) => !result.replayed)).toHaveLength(1);

    const created = createdResults[0];
    const briefed = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: briefCommand({
        fixture,
        intakeId: created.intakeId,
        expectedStateVersion: created.stateVersion,
      }),
    });
    const exactSource = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: briefed.stateVersion,
      commandId: "36360000-0000-4000-8000-000000000202",
      label: "concurrent-exact",
    });
    const exactResults = await Promise.all(
      Array.from({ length: 20 }, () => admitProjectBrainSource({
        userId: fixture.ownerId,
        command: exactSource.command,
        bytes: exactSource.bytes,
      })),
    );
    expect(new Set(exactResults.map((result) => result.canonicalEffectId)).size).toBe(1);
    expect(exactResults.filter((result) => !result.replayed)).toHaveLength(1);

    const currentVersion = exactResults[0].stateVersion;
    const competing = await Promise.allSettled([
      sourceCommand({ fixture, intakeId: created.intakeId, expectedStateVersion: currentVersion, label: "race-a" }),
      sourceCommand({ fixture, intakeId: created.intakeId, expectedStateVersion: currentVersion, label: "race-b" }),
    ].map((source) => admitProjectBrainSource({
      userId: fixture.ownerId,
      command: source.command,
      bytes: source.bytes,
    })));
    expect(competing.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(competing.filter((result) => result.status === "rejected")).toHaveLength(1);

    const rows = await prisma.$queryRaw<Array<{ count: bigint; maxOrdinal: number }>>`
      SELECT count(*)::bigint AS count, max("ordinal")::integer AS "maxOrdinal"
      FROM "ConstructionProjectBrainSource"
      WHERE "intakeId" = ${created.intakeId}
    `;
    expect(rows[0]).toEqual({ count: 2n, maxOrdinal: 2 });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("serializes a reused command identity across different projects in one workspace", async () => {
    const fixture = await setup("CROSS-PROJECT-COMMAND");
    const commandId = "36360000-0000-4000-8000-000000000299";
    const outcomes = await Promise.allSettled([
      processProjectBrainIntakeCommand({
        userId: fixture.ownerId,
        command: createCommand(fixture, commandId),
      }),
      processProjectBrainIntakeCommand({
        userId: fixture.ownerId,
        command: {
          ...createCommand(fixture, commandId),
          projectId: fixture.otherProjectId,
        },
      }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "PROJECT_BRAIN_IDEMPOTENCY_CONFLICT" }),
    });
    expect(await prisma.constructionProjectBrainDecision.count({
      where: { workspaceId: fixture.workspaceId, commandId },
    })).toBe(1);
    expect(await prisma.constructionProjectBrainIntake.count({
      where: { workspaceId: fixture.workspaceId },
    })).toBe(1);
  });

  it("compensates the real object written by a losing ADMIT_SOURCE versus SUBMIT race", async () => {
    const fixture = await setup("ADMIT-SUBMIT-RACE");
    const created = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: createCommand(fixture),
    });
    const briefed = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: briefCommand({
        fixture,
        intakeId: created.intakeId,
        expectedStateVersion: created.stateVersion,
      }),
    });
    const baselineSource = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: briefed.stateVersion,
      label: "race-baseline",
    });
    const baselineAdmitted = await admitProjectBrainSource({
      userId: fixture.ownerId,
      command: baselineSource.command,
      bytes: baselineSource.bytes,
    });

    const losingSource = sourceCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: baselineAdmitted.stateVersion,
      commandId: crypto.randomUUID(),
      label: "race-loser",
    });
    const submit = submitCommand({
      fixture,
      intakeId: created.intakeId,
      expectedStateVersion: baselineAdmitted.stateVersion,
      commandId: crypto.randomUUID(),
    });

    let releaseSource!: () => void;
    const sourceMayContinue = new Promise<void>((resolveSource) => {
      releaseSource = resolveSource;
    });
    let announceWritten: ((key: string) => void) | undefined;
    const objectWritten = new Promise<string>((resolveWritten) => {
      announceWritten = resolveWritten;
    });
    let capturedStorageKey: string | null = null;
    storageRaceGate.current = {
      matches: (key) => key.includes(`/${created.intakeId}/`),
      afterRealWrite: async (key) => {
        capturedStorageKey = key;
        announceWritten?.(key);
        await sourceMayContinue;
      },
    };

    let sourceOutcomePromise: Promise<
      | { status: "fulfilled"; value: CommandResult }
      | { status: "rejected"; reason: unknown }
    > | null = null;
    try {
      sourceOutcomePromise = admitProjectBrainSource({
        userId: fixture.ownerId,
        command: losingSource.command,
        bytes: losingSource.bytes,
      }).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );

      const writtenKey = await withTimeout(objectWritten, 10_000);
      expect(await localObjectExists(writtenKey)).toBe(true);

      const submitted = await processProjectBrainIntakeCommand({
        userId: fixture.ownerId,
        command: submit,
      });
      expect(submitted).toMatchObject({
        status: "READY_FOR_REVIEW",
        stateVersion: baselineAdmitted.stateVersion + 1,
      });

      releaseSource();
      const sourceOutcome = await withTimeout(sourceOutcomePromise, 10_000);
      expect(sourceOutcome.status).toBe("rejected");
      if (sourceOutcome.status === "rejected") {
        expect(String(sourceOutcome.reason)).toContain("PROJECT_BRAIN_STATE_REFUSED");
      }

      expect(await prisma.constructionProjectBrainSource.count({
        where: { workspaceId: fixture.workspaceId, commandId: losingSource.command.commandId },
      })).toBe(0);
      expect(await prisma.constructionProjectBrainDecision.count({
        where: { workspaceId: fixture.workspaceId, commandId: losingSource.command.commandId },
      })).toBe(0);
      expect(await prisma.file.count({ where: { storageKey: writtenKey } })).toBe(0);
      expect(await localObjectExists(writtenKey)).toBe(false);

      const retainedSources = await prisma.constructionProjectBrainSource.findMany({
        where: { intakeId: created.intakeId },
        orderBy: { ordinal: "asc" },
        select: { commandId: true, ordinal: true, fileId: true },
      });
      expect(retainedSources).toEqual([
        expect.objectContaining({
          commandId: baselineSource.command.commandId,
          ordinal: 1,
        }),
      ]);
      const submittedSnapshot = await prisma.constructionProjectBrainSnapshot.findFirstOrThrow({
        where: { intakeId: created.intakeId, status: "PROPOSED" },
        select: { snapshot: true },
      });
      expect(JSON.stringify(submittedSnapshot.snapshot)).toContain("race-baseline.pdf");
      expect(JSON.stringify(submittedSnapshot.snapshot)).not.toContain("race-loser.pdf");
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      releaseSource?.();
      storageRaceGate.current = null;
      if (sourceOutcomePromise) await sourceOutcomePromise;
      if (capturedStorageKey) {
        const persisted = await prisma.file.findFirst({
          where: { storageKey: capturedStorageKey },
          select: { id: true },
        });
        if (!persisted) await deleteLocalObject(capturedStorageKey);
      }
    }
  });

  it("restores the byte-equivalent confirmed projection in a fresh Node process", async () => {
    const fixture = await setup("RESTART");
    const { created, stateVersion } = await createBriefAndSources(fixture, "restart");
    const submitted = await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: {
        schemaVersion: 1,
        action: "SUBMIT_PROJECT_BRAIN_INTAKE",
        commandId: crypto.randomUUID(),
        workspaceId: fixture.workspaceId,
        projectId: fixture.projectId,
        intakeId: created.intakeId,
        expectedStateVersion: stateVersion,
      },
    });
    await processProjectBrainIntakeCommand({
      userId: fixture.ownerId,
      command: {
        schemaVersion: 1,
        action: "CONFIRM_PROJECT_BRAIN_INTAKE",
        commandId: crypto.randomUUID(),
        workspaceId: fixture.workspaceId,
        projectId: fixture.projectId,
        intakeId: created.intakeId,
        expectedStateVersion: submitted.stateVersion,
        reviewFingerprint: submitted.reviewFingerprint!,
      },
    });
    const beforeRestart = await projectBrainIntakeProjectionForUser({
      userId: fixture.ownerId,
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
    });
    await prisma.$disconnect();
    const probe = spawnSync(process.execPath, [
      "--require",
      resolve("scripts/register-server-only.cjs"),
      "--import",
      "tsx",
      resolve("test/integration/r36v-project-brain-restart-probe.ts"),
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        R36V_RESTART_USER_ID: fixture.ownerId,
        R36V_RESTART_WORKSPACE_ID: fixture.workspaceId,
        R36V_RESTART_PROJECT_ID: fixture.projectId,
      },
    });
    expect(probe.status, probe.stderr).toBe(0);
    expect(probe.stdout.trim()).toBe(JSON.stringify(beforeRestart));
    const afterRestart = JSON.parse(probe.stdout) as typeof beforeRestart;
    expect(afterRestart).toEqual(beforeRestart);
    await prisma.$connect();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
