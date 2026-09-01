import { describe, expect, it } from "vitest";
import { mobileJobCommandResultSchema, mobileJobCommandSchema, parseMobileJobSchedule } from "../src/lib/jobs";
import { enqueueMobileOutbox, loadMobileOutbox, transitionMobileOutbox, type SecureOutboxStore } from "../src/lib/outbox";

const job = {
  id: "job-1",
  projectId: "project-1",
  projectCode: "LAVAL-001",
  projectName: "Rénovation Laval",
  title: "Installer les fenêtres",
  description: null,
  startsAt: "2026-09-03T13:00:00.000Z",
  endsAt: "2026-09-03T15:00:00.000Z",
  timezone: "America/Toronto",
  status: "SCHEDULED" as const,
  priority: 0,
  version: 3,
  assignments: [{ kind: "MEMBER" as const, assigneeId: "user-1", displayName: "Alex", roleLabel: "Installateur" }],
  dependencies: [],
};

const base = {
  schemaVersion: 1 as const,
  generatedAt: "2026-09-02T12:00:00.000Z",
  workspaceId: "workspace-1",
};

describe("native R19 jobs contracts", () => {
  it("accepts owner and assigned-only field projections", () => {
    const owner = parseMobileJobSchedule({ ...base, role: "OWNER", jobs: [{ ...job, conflicts: [], impactedJobs: [] }] });
    const field = parseMobileJobSchedule({ ...base, role: "FIELD_WORKER", jobs: [job] });
    expect(owner.jobs[0].title).toBe("Installer les fenêtres");
    expect(field.jobs[0].assignments[0].assigneeId).toBe("user-1");
  });

  it("recursively refuses financial, provenance and owner-only data from field views", () => {
    expect(() => parseMobileJobSchedule({ ...base, role: "FIELD_WORKER", jobs: [{ ...job, amountMinor: 120_000 }] })).toThrow("MOBILE_JOB_FIELD_LEAK_REFUSED");
    expect(() => parseMobileJobSchedule({ ...base, role: "FIELD_WORKER", jobs: [{ ...job, conflicts: [] }] })).toThrow("MOBILE_JOB_FIELD_LEAK_REFUSED");
  });

  it("prepares only strict local schedule commands and verifies zero transport results", () => {
    const command = mobileJobCommandSchema.parse({
      schemaVersion: 1,
      commandId: crypto.randomUUID(),
      workspaceId: "workspace-1",
      action: "COMMIT_SCHEDULE",
      jobId: "job-1",
      expectedVersion: 3,
    });
    expect(command.action).toBe("COMMIT_SCHEDULE");
    expect(() => mobileJobCommandSchema.parse({ ...command, provider: "google-calendar" })).toThrow();
    expect(mobileJobCommandResultSchema.parse({
      schemaVersion: 1,
      commandId: command.commandId,
      workspaceId: command.workspaceId,
      action: command.action,
      jobId: command.jobId,
      status: "SCHEDULED",
      version: 4,
      applied: true,
      replayed: false,
      conflicts: [],
      impactedJobs: [],
      externalTransportPerformed: false,
    }).externalTransportPerformed).toBe(false);
  });

  it("retains the exact job command after an interrupted mobile attempt", async () => {
    const values = new Map<string, string>();
    const store: SecureOutboxStore = {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => { values.set(key, value); },
      deleteItemAsync: async (key) => { values.delete(key); },
    };
    const command = mobileJobCommandSchema.parse({
      schemaVersion: 1,
      commandId: crypto.randomUUID(),
      workspaceId: "workspace-1",
      action: "COMMIT_SCHEDULE",
      jobId: "job-1",
      expectedVersion: 3,
    });
    const entry = await enqueueMobileOutbox({ kind: "JOB_COMMAND", command, store });
    await transitionMobileOutbox({ entryId: entry.entryId, state: "SENDING", store });
    const restored = await loadMobileOutbox({ workspaceId: "workspace-1", store });
    expect(restored[0]).toMatchObject({ kind: "JOB_COMMAND", command, state: "OUTCOME_UNKNOWN" });
  });
});
