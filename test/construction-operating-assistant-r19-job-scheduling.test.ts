import { describe, expect, it } from "vitest";
import { jobSchedulingCommandSchema } from "@/lib/construction-operating-assistant-r19/contracts";
import {
  calculateScheduleImpacts,
  dependencyWouldCycle,
  evaluateScheduleConflicts,
  intervalsOverlap,
  rejectFieldScheduleLeaks,
} from "@/lib/construction-operating-assistant-r19/scheduling";

const at = (hour: number) => new Date(`2026-09-02T${String(hour).padStart(2, "0")}:00:00.000Z`);

describe("R19 job scheduling contracts", () => {
  it("accepts strict provider-neutral commands and rejects unknown fields", () => {
    const valid = {
      schemaVersion: 1,
      commandId: crypto.randomUUID(),
      workspaceId: "workspace-1",
      action: "CREATE_JOB",
      projectId: "project-1",
      title: "Installer les fenêtres",
      description: null,
      startsAt: at(13).toISOString(),
      endsAt: at(15).toISOString(),
      priority: 2,
      sourceRef: null,
    };
    expect(jobSchedulingCommandSchema.parse(valid).action).toBe("CREATE_JOB");
    expect(jobSchedulingCommandSchema.safeParse({ ...valid, provider: "twilio" }).success).toBe(false);
  });

  it("uses half-open intervals so adjacent work is not an overlap", () => {
    expect(intervalsOverlap({ startsAt: at(10), endsAt: at(12) }, { startsAt: at(12), endsAt: at(14) })).toBe(false);
    expect(intervalsOverlap({ startsAt: at(10), endsAt: at(12) }, { startsAt: at(11), endsAt: at(14) })).toBe(true);
  });

  it("refuses dependency cycles including indirect cycles", () => {
    const edges = [
      { predecessorJobId: "a", successorJobId: "b" },
      { predecessorJobId: "b", successorJobId: "c" },
    ];
    expect(dependencyWouldCycle(edges, "c", "a")).toBe(true);
    expect(dependencyWouldCycle(edges, "a", "c")).toBe(false);
    expect(dependencyWouldCycle(edges, "a", "a")).toBe(true);
  });

  it("reports assignment, availability and dependency conflicts before commit", () => {
    const conflicts = evaluateScheduleConflicts({
      job: { id: "job-new", startsAt: at(13), endsAt: at(15) },
      assignments: [{ assigneeKind: "CONTACT", assigneeId: "marc" }],
      scheduledAssignments: [{
        jobId: "job-existing",
        assigneeKind: "CONTACT",
        assigneeId: "marc",
        startsAt: at(14),
        endsAt: at(16),
      }],
      availability: [{
        assigneeKind: "CONTACT",
        assigneeId: "marc",
        kind: "UNAVAILABLE",
        startsAt: at(12),
        endsAt: at(14),
      }],
      predecessors: [{ id: "job-prior", status: "SCHEDULED", endsAt: at(14) }],
    });
    expect(conflicts.map((conflict) => conflict.code)).toEqual([
      "ASSIGNMENT_OVERLAP",
      "DEPENDENCY_NOT_COMPLETED",
      "DEPENDENCY_TIME_CONFLICT",
      "RESOURCE_UNAVAILABLE",
    ]);
  });

  it("reports transitive schedule impact without moving successors", () => {
    const impacts = calculateScheduleImpacts({
      rescheduledJobId: "a",
      rescheduledEndsAt: at(17),
      edges: [
        { predecessorJobId: "a", successorJobId: "b" },
        { predecessorJobId: "b", successorJobId: "c" },
      ],
      jobs: [
        { id: "b", startsAt: at(16) },
        { id: "c", startsAt: at(18) },
      ],
    });
    expect(impacts).toEqual([{
      jobId: "b",
      reason: "PREDECESSOR_ENDS_AFTER_SUCCESSOR_START",
      delayMinutes: 60,
    }]);
  });

  it("rejects financial and provenance keys from field projections", () => {
    expect(() => rejectFieldScheduleLeaks({ jobs: [{ id: "job-1", amountMinor: 120_000 }] })).toThrow(
      "JOB_SCHEDULE_FIELD_LEAK_REFUSED",
    );
    expect(() => rejectFieldScheduleLeaks({ jobs: [{ id: "job-1", title: "Dosseret" }] })).not.toThrow();
  });
});
