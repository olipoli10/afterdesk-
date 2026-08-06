"use server";

import { requireApprovedVa, requireRole } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { VA_FILE_ACCESS_STATUSES } from "@/lib/status";
import {
  openSessionFor,
  pauseSession,
  resumeSession,
  startSession,
  stopSession,
  type SessionView,
} from "@/server/work-sessions";

/**
 * TIMER ACTIONS. Two identities, two gates, zero shared surface:
 *
 *  - the WORKER (approved VA, on a task they claimed, while its status
 *    allows work) drives role "worker";
 *  - the REVIEWER is the ADMIN today (Role has no REVIEWER — the plan-side
 *    enum is pre-provisioned only) and drives role "reviewer" from the QC
 *    screen.
 *
 * userId always comes from the SESSION, never from a parameter: a worker
 * cannot start, read or stop anyone's timer but their own. The responses
 * carry no cost, price or margin — a timer knows only its own seconds.
 */

export type SessionActionResult =
  | { ok: true; session: SessionView | null }
  | { ok: false; error: string };

async function workerGate(taskId: string, userId: string): Promise<string | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, claimedById: userId, status: { in: [...VA_FILE_ACCESS_STATUSES] } },
    select: { status: true, workflowRun: { select: { id: true } } },
  });
  if (!task) return null;
  return task.status;
}

export async function startWorkerSession(taskId: string): Promise<SessionActionResult> {
  const user = await requireApprovedVa();
  const status = await workerGate(taskId, user.id);
  if (!status) return { ok: false, error: "This task is not yours to time." };
  const run = await prisma.taskWorkflowRun.findUnique({
    where: { taskId },
    select: { id: true },
  });
  const session = await startSession({
    taskId,
    userId: user.id,
    role: "worker",
    phase: status === "revision_requested" ? "revision" : "residual_work",
    workflowRunId: run?.id ?? null,
    now: new Date(),
  });
  return { ok: true, session };
}

export async function pauseWorkerSession(taskId: string): Promise<SessionActionResult> {
  const user = await requireApprovedVa();
  const open = await openSessionFor(taskId, user.id, "worker");
  if (open) await pauseSession(open.id, user.id, new Date());
  return { ok: true, session: await openSessionFor(taskId, user.id, "worker") };
}

export async function resumeWorkerSession(taskId: string): Promise<SessionActionResult> {
  const user = await requireApprovedVa();
  const status = await workerGate(taskId, user.id);
  if (!status) return { ok: false, error: "This task is not yours to time." };
  const open = await openSessionFor(taskId, user.id, "worker");
  if (open) await resumeSession(open.id, user.id, new Date());
  return { ok: true, session: await openSessionFor(taskId, user.id, "worker") };
}

export async function finishWorkerSession(taskId: string): Promise<SessionActionResult> {
  const user = await requireApprovedVa();
  const open = await openSessionFor(taskId, user.id, "worker");
  if (open) await stopSession(open.id, user.id, new Date());
  return { ok: true, session: null };
}

// ── Reviewer (admin) ──────────────────────────────────────────────────────

export async function startReviewerSession(taskId: string): Promise<SessionActionResult> {
  const admin = await requireRole("ADMIN");
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, workflowRun: { select: { id: true } } },
  });
  if (!task) return { ok: false, error: "Task not found." };
  const session = await startSession({
    taskId,
    userId: admin.id,
    role: "reviewer",
    phase: "qc",
    workflowRunId: task.workflowRun?.id ?? null,
    now: new Date(),
  });
  return { ok: true, session };
}

export async function pauseReviewerSession(taskId: string): Promise<SessionActionResult> {
  const admin = await requireRole("ADMIN");
  const open = await openSessionFor(taskId, admin.id, "reviewer");
  if (open) await pauseSession(open.id, admin.id, new Date());
  return { ok: true, session: await openSessionFor(taskId, admin.id, "reviewer") };
}

export async function resumeReviewerSession(taskId: string): Promise<SessionActionResult> {
  const admin = await requireRole("ADMIN");
  const open = await openSessionFor(taskId, admin.id, "reviewer");
  if (open) await resumeSession(open.id, admin.id, new Date());
  return { ok: true, session: await openSessionFor(taskId, admin.id, "reviewer") };
}

export async function finishReviewerSession(taskId: string): Promise<SessionActionResult> {
  const admin = await requireRole("ADMIN");
  const open = await openSessionFor(taskId, admin.id, "reviewer");
  if (open) await stopSession(open.id, admin.id, new Date());
  return { ok: true, session: null };
}
