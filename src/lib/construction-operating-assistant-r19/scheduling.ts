import type { JobConflict, ScheduleImpact } from "./contracts";

export type Interval = Readonly<{ startsAt: Date; endsAt: Date }>;

export function assertValidInterval(interval: Interval): void {
  if (!Number.isFinite(interval.startsAt.getTime()) || !Number.isFinite(interval.endsAt.getTime())) {
    throw new Error("JOB_SCHEDULE_INVALID_TIME");
  }
  if (interval.endsAt.getTime() <= interval.startsAt.getTime()) {
    throw new Error("JOB_SCHEDULE_INVALID_INTERVAL");
  }
}

export function intervalsOverlap(left: Interval, right: Interval): boolean {
  return left.startsAt < right.endsAt && right.startsAt < left.endsAt;
}

export function dependencyWouldCycle(
  edges: ReadonlyArray<Readonly<{ predecessorJobId: string; successorJobId: string }>>,
  predecessorJobId: string,
  successorJobId: string,
): boolean {
  if (predecessorJobId === successorJobId) return true;
  const successors = new Map<string, string[]>();
  for (const edge of [...edges, { predecessorJobId, successorJobId }]) {
    const current = successors.get(edge.predecessorJobId) ?? [];
    current.push(edge.successorJobId);
    successors.set(edge.predecessorJobId, current);
  }
  const stack = [successorJobId];
  const visited = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === predecessorJobId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    stack.push(...(successors.get(current) ?? []));
  }
  return false;
}

export function collectTransitiveSuccessors(
  edges: ReadonlyArray<Readonly<{ predecessorJobId: string; successorJobId: string }>>,
  jobId: string,
): string[] {
  const direct = new Map<string, string[]>();
  for (const edge of edges) {
    const current = direct.get(edge.predecessorJobId) ?? [];
    current.push(edge.successorJobId);
    direct.set(edge.predecessorJobId, current);
  }
  const result = new Set<string>();
  const stack = [...(direct.get(jobId) ?? [])];
  while (stack.length) {
    const current = stack.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    stack.push(...(direct.get(current) ?? []));
  }
  return [...result].sort();
}

export function evaluateScheduleConflicts(input: {
  job: Readonly<{ id: string; startsAt: Date; endsAt: Date }>;
  assignments: ReadonlyArray<Readonly<{ assigneeKind: "MEMBER" | "CONTACT"; assigneeId: string }>>;
  scheduledAssignments: ReadonlyArray<Readonly<{
    jobId: string;
    assigneeKind: "MEMBER" | "CONTACT";
    assigneeId: string;
    startsAt: Date;
    endsAt: Date;
  }>>;
  availability: ReadonlyArray<Readonly<{
    assigneeKind: "MEMBER" | "CONTACT";
    assigneeId: string;
    kind: "AVAILABLE" | "UNAVAILABLE";
    startsAt: Date;
    endsAt: Date;
  }>>;
  predecessors: ReadonlyArray<Readonly<{
    id: string;
    status: "PROPOSED" | "SCHEDULED" | "BLOCKED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
    endsAt: Date;
  }>>;
}): JobConflict[] {
  assertValidInterval(input.job);
  const conflicts: JobConflict[] = [];
  if (input.assignments.length === 0) {
    conflicts.push({
      code: "ASSIGNEE_REQUIRED",
      jobId: input.job.id,
      relatedJobId: null,
      assigneeKind: null,
      assigneeId: null,
      detail: "Une personne ou un sous-traitant responsable doit être affecté avant l’engagement.",
    });
  }
  for (const assignment of input.assignments) {
    for (const scheduled of input.scheduledAssignments) {
      if (
        scheduled.jobId !== input.job.id &&
        scheduled.assigneeKind === assignment.assigneeKind &&
        scheduled.assigneeId === assignment.assigneeId &&
        intervalsOverlap(input.job, scheduled)
      ) {
        conflicts.push({
          code: "ASSIGNMENT_OVERLAP",
          jobId: input.job.id,
          relatedJobId: scheduled.jobId,
          ...assignment,
          detail: "Cette ressource est déjà affectée à un autre travail pendant cet intervalle.",
        });
      }
    }
    const resourceAvailability = input.availability.filter(
      (entry) => entry.assigneeKind === assignment.assigneeKind && entry.assigneeId === assignment.assigneeId,
    );
    for (const entry of resourceAvailability.filter((candidate) => candidate.kind === "UNAVAILABLE")) {
      if (intervalsOverlap(input.job, entry)) {
        conflicts.push({
          code: "RESOURCE_UNAVAILABLE",
          jobId: input.job.id,
          relatedJobId: null,
          ...assignment,
          detail: "Cette ressource est explicitement indisponible pendant ce travail.",
        });
      }
    }
    const available = resourceAvailability.filter((candidate) => candidate.kind === "AVAILABLE");
    if (
      available.length > 0 &&
      !available.some((entry) => entry.startsAt <= input.job.startsAt && entry.endsAt >= input.job.endsAt)
    ) {
      conflicts.push({
        code: "OUTSIDE_AVAILABLE_WINDOW",
        jobId: input.job.id,
        relatedJobId: null,
        ...assignment,
        detail: "Ce travail ne tient dans aucune plage de disponibilité déclarée.",
      });
    }
  }
  for (const predecessor of input.predecessors) {
    if (predecessor.status !== "COMPLETED") {
      conflicts.push({
        code: "DEPENDENCY_NOT_COMPLETED",
        jobId: input.job.id,
        relatedJobId: predecessor.id,
        assigneeKind: null,
        assigneeId: null,
        detail: "Un travail préalable n’est pas terminé.",
      });
    }
    if (predecessor.endsAt > input.job.startsAt) {
      conflicts.push({
        code: "DEPENDENCY_TIME_CONFLICT",
        jobId: input.job.id,
        relatedJobId: predecessor.id,
        assigneeKind: null,
        assigneeId: null,
        detail: "Un travail préalable se termine après le début de ce travail.",
      });
    }
  }
  return conflicts.sort((a, b) =>
    `${a.code}:${a.relatedJobId ?? ""}:${a.assigneeId ?? ""}`.localeCompare(
      `${b.code}:${b.relatedJobId ?? ""}:${b.assigneeId ?? ""}`,
    ),
  );
}

export function calculateScheduleImpacts(input: {
  rescheduledJobId: string;
  rescheduledEndsAt: Date;
  edges: ReadonlyArray<Readonly<{ predecessorJobId: string; successorJobId: string }>>;
  jobs: ReadonlyArray<Readonly<{ id: string; startsAt: Date }>>;
}): ScheduleImpact[] {
  const successors = new Set(collectTransitiveSuccessors(input.edges, input.rescheduledJobId));
  return input.jobs
    .filter((job) => successors.has(job.id) && input.rescheduledEndsAt > job.startsAt)
    .map((job) => ({
      jobId: job.id,
      reason: "PREDECESSOR_ENDS_AFTER_SUCCESSOR_START" as const,
      delayMinutes: Math.max(1, Math.ceil((input.rescheduledEndsAt.getTime() - job.startsAt.getTime()) / 60_000)),
    }))
    .sort((a, b) => a.jobId.localeCompare(b.jobId));
}

const FIELD_FORBIDDEN_KEYS = new Set([
  "financial",
  "amountMinor",
  "outstandingAmountMinor",
  "invoiceReference",
  "receivable",
  "payment",
  "sourceRef",
  "beforeState",
  "afterState",
  "result",
]);

export function rejectFieldScheduleLeaks(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectFieldScheduleLeaks);
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FIELD_FORBIDDEN_KEYS.has(key)) throw new Error("JOB_SCHEDULE_FIELD_LEAK_REFUSED");
    rejectFieldScheduleLeaks(child);
  }
}
