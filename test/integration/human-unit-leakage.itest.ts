import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { humanUnitForWorker } from "@/lib/queries/human-unit";
import {
  clientTaskSelect,
  executionReportForClient,
  taskForClient,
} from "@/lib/queries/tasks";
import { createWorker } from "./fixtures";
import { createUs4Unit } from "./human-unit-us4-fixtures";

const ACTIVE_KEYS = [
  "acceptanceCriteria",
  "declaredInputs",
  "instructions",
  "kind",
  "latestOwnCandidate",
  "outputSchema",
  "readOnly",
  "remainingRevisions",
  "requiredArtifactKinds",
  "revisionInstructions",
  "state",
  "submissionDeadlineAt",
];

const DATA_CLASSES = [
  "public_business",
  "business_confidential",
  "personal_sensitive",
] as const;

const LIFECYCLE = [
  ["admitted", "claimed", null, undefined],
  ["published", "open", null, undefined],
  ["claimed", "claimed", "unit", false],
  ["revision_requested", "revision_requested", "unit", false],
  ["submitted", "submitted_for_qc", "unit", true],
  ["in_review", "submitted_for_qc", "unit", true],
  ["accepted", "submitted_for_qc", "status", undefined],
  ["resumed", "claimed", "status", undefined],
  ["paused", "claimed", "status", undefined],
  ["exhausted", "claimed", "status", undefined],
  ["withdrawn", "claimed", "status", undefined],
] as const;

function deepKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return out;
  for (const [key, nested] of Object.entries(value)) {
    out.add(key);
    deepKeys(nested, out);
  }
  return out;
}

describe("T054 worker projection is an allowlist, not a filtered task", () => {
  it("selects exactly the worker contract and none of the seeded secrets", async () => {
    const fixture = await createUs4Unit({
      declaredInputs: [
        {
          kind: "payload_field",
          ref: "approved public value",
          label: "Approved field",
          dataClass: "public_business",
        },
      ],
    });
    const view = await humanUnitForWorker({
      taskId: fixture.task.id,
      workerId: fixture.worker.id,
      claimGeneration: 1,
    });

    expect(view?.kind).toBe("unit");
    expect(Object.keys(view!).sort()).toEqual(ACTIVE_KEYS);
    expect(JSON.stringify(view)).toContain("approved public value");
    for (const forbidden of [
      "98765",
      "SECRET CLIENT TITLE",
      "SECRET RAW CONTRACT DESCRIPTION",
      "NEVER PROJECT",
      "SECRET STEP INTERNAL",
      "88888",
      "77777",
      "clientPriceCents",
      "vaPayoutCents",
      "workflowBudgetHold",
      "transitionSeq",
    ]) expect(JSON.stringify(view)).not.toContain(forbidden);
  });

  it("returns the same null for a stranger, a guessed task and a stale generation", async () => {
    const fixture = await createUs4Unit();
    const stranger = await createWorker();
    const absent = await humanUnitForWorker({
      taskId: "does-not-exist",
      workerId: stranger.id,
      claimGeneration: 999,
    });
    const guessed = await humanUnitForWorker({
      taskId: fixture.task.id,
      workerId: stranger.id,
      claimGeneration: 1,
    });
    const stale = await humanUnitForWorker({
      taskId: fixture.task.id,
      workerId: fixture.worker.id,
      claimGeneration: 0,
    });
    expect(absent).toBeNull();
    expect(guessed).toEqual(absent);
    expect(stale).toEqual(absent);
  });

  it("rechecks live approval while retaining the frozen eligibility contract", async () => {
    const fixture = await createUs4Unit();
    expect(await humanUnitForWorker({
      taskId: fixture.task.id,
      workerId: fixture.worker.id,
      claimGeneration: 1,
    })).not.toBeNull();

    await prisma.vaProfile.update({
      where: { userId: fixture.worker.id },
      data: { status: "suspended" },
    });
    expect(await humanUnitForWorker({
      taskId: fixture.task.id,
      workerId: fixture.worker.id,
      claimGeneration: 1,
    })).toBeNull();
  });

  it.each(
    LIFECYCLE.flatMap(([state, taskStatus, kind, readOnly]) =>
      DATA_CLASSES.map((dataClass) => [state, taskStatus, kind, readOnly, dataClass] as const),
    ),
  )("enforces the %s/%s lifecycle and classification visibility window", async (
    state,
    taskStatus,
    kind,
    readOnly,
    dataClass,
  ) => {
    const fixture = await createUs4Unit({
      state,
      taskStatus,
      dataClass,
      declaredInputs: [{
        kind: "payload_field",
        ref: `allowed-${dataClass}`,
        label: "Allowed field",
        dataClass,
      }],
    });
    const view = await humanUnitForWorker({
      taskId: fixture.task.id,
      workerId: fixture.worker.id,
      claimGeneration: fixture.claimGeneration,
    });
    if (kind === null) {
      expect(view).toBeNull();
      return;
    }
    expect(view?.kind).toBe(kind);
    if (kind === "unit") {
      expect(view).toMatchObject({ readOnly });
      expect(JSON.stringify(view)).toContain(`allowed-${dataClass}`);
    } else {
      expect(Object.keys(view!).sort()).toEqual(["kind", "nextAction", "status"]);
      expect(JSON.stringify(view)).not.toContain("instructions");
      expect(JSON.stringify(view)).not.toContain("candidate");
    }
  });

  it("keeps worker payout out of every client projection", () => {
    const keys = deepKeys(clientTaskSelect);
    expect(keys.has("vaPayoutCents")).toBe(false);
    expect(keys.has("claimedById")).toBe(false);
    expect(keys.has("claimedBy")).toBe(false);
  });
});

describe("T066 admitted units close the existing worker-page leak", () => {
  const workerPage = readFileSync(
    join(__dirname, "..", "..", "src", "app", "va", "tasks", "[id]", "page.tsx"),
    "utf8",
  );

  it("renders the declared unit projection instead of the generic brief and raw file list", () => {
    // This is deliberately RED until T069 mounts the T067 panel.  It is a
    // page-level regression net: a secure query alone is insufficient while
    // the established VA page still renders Task.description and Task.files.
    expect(workerPage).toContain("humanUnitForWorker");
    expect(workerPage).toMatch(/humanUnit\s*\?[\s\S]{0,2400}task\.description/);
    expect(workerPage).toMatch(/humanUnit\s*\?[\s\S]{0,4200}task\.files\.map/);
  });

  it("leaves the client task view and execution report byte-identical when unit audit rows exist", async () => {
    const fixture = await createUs4Unit();
    const task = await prisma.task.findUniqueOrThrow({
      where: { id: fixture.task.id },
      select: { clientId: true },
    });
    const beforeTask = await taskForClient(fixture.task.id, task.clientId);
    const beforeReport = await executionReportForClient(fixture.task.id, task.clientId);

    await prisma.taskEvent.createMany({
      data: [
        "human_unit_claimed",
        "human_unit_submitted",
        "human_unit_paused",
        "human_unit_resumed",
      ].map((action) => ({ taskId: fixture.task.id, action })),
    });

    expect(JSON.stringify(await taskForClient(fixture.task.id, task.clientId))).toBe(
      JSON.stringify(beforeTask),
    );
    expect(JSON.stringify(await executionReportForClient(fixture.task.id, task.clientId))).toBe(
      JSON.stringify(beforeReport),
    );
  });
});
