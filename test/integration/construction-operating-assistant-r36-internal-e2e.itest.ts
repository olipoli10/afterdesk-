import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sha256Canonical } from "@/lib/construction-assistant-v1/canonical";
import { parseGoldenWorkflowProjection } from "@/lib/construction-operating-assistant-r33/contracts";
import { INTERNAL_E2E_CHECKPOINT_CODES, parseInternalE2EReport, type InternalE2ECheckpointCode } from "@/lib/construction-operating-assistant-r36/contracts";
import { INTERNAL_E2E_CLOSED_SCENARIO } from "@/lib/construction-operating-assistant-r36/scenario";
import { transitionTask } from "@/lib/state";
import { constructionHumanEscalationForWorker } from "@/lib/queries/construction-human-escalation";
import {
  addInvoiceReadinessEvidence,
  openLoopProjectionForUser,
  prepareInvoiceEvidenceRequest,
  recordOpenLoopContradiction,
  recordWorkFinished,
  resolveOpenLoopContradiction,
} from "@/server/construction-operating-assistant-r0/open-loops";
import { processUnifiedIntent } from "@/server/construction-operating-assistant-r18/unified-intent";
import {
  humanEscalationCockpitForUser,
  processHumanEscalationCommand,
  recoverHumanEscalationsForOperator,
} from "@/server/construction-operating-assistant-r22/human-escalation-cockpit";
import { processOnboardingCommand } from "@/server/construction-operating-assistant-r32/onboarding";
import { goldenWorkflowForUser } from "@/server/construction-operating-assistant-r33/golden-workflow";
import { runInternalE2EScenario } from "@/server/construction-operating-assistant-r36/internal-e2e";
import { activateFundedConstructionHumanEscalation } from "@/server/construction-operating-assistant-r5/escalations";
import {
  bindClaimToHumanUnit,
  decideHumanUnitCandidate,
  openHumanUnitReview,
  submitHumanUnitCandidate,
} from "@/server/human-unit";
import { parseMobileGoldenWorkflow } from "../../apps/mobile/src/lib/golden-workflow";
import { validateReleaseManifest } from "../../scripts/validate-endvera-release-package.mjs";
import { createWorker } from "./fixtures";

type State = {
  ownerId: string;
  fieldId: string;
  workspaceId: string;
  projectId: string;
  contactId: string;
  clearSourceId: string;
  clearEnvelope: Parameters<typeof processUnifiedIntent>[0]["envelope"];
  loopId: string;
  loopVersion: number;
  contradictionId: string;
  approvalInput: unknown;
  preparedActionId: string;
  preparedRequest: Parameters<typeof prepareInvoiceEvidenceRequest>[0];
  escalationId: string;
  escalationTaskId: string;
  restartBefore: string;
  restartAfter: string;
};

const state = {} as State;

async function externalEffectCount() {
  return prisma.constructionConnectorOperation.count({
    where: { workspaceId: state.workspaceId, externalTransportPerformed: true },
  });
}

async function acceptHumanEscalation() {
  const payment = await prisma.payment.create({
    data: {
      taskId: state.escalationTaskId,
      amountCents: 5_000,
      currency: "CAD",
      method: "card",
      status: "authorized",
      note: "Synthetic local R36 authorization; no provider call.",
    },
  });
  await activateFundedConstructionHumanEscalation({
    escalationId: state.escalationId,
    actorId: state.ownerId,
    workspaceId: state.workspaceId,
    paymentId: payment.id,
  });
  const worker = await createWorker();
  const reviewer = await prisma.user.create({
    data: { name: "R36 reviewer", email: `r36-reviewer-${crypto.randomUUID()}@example.invalid`, role: "ADMIN" },
  });
  await prisma.$transaction(async (tx) => {
    await transitionTask({
      tx,
      taskId: state.escalationTaskId,
      from: "open",
      to: "claimed",
      action: "r36_worker_claimed",
      actorId: worker.id,
      data: { claimedById: worker.id, claimedAt: new Date("2026-09-02T14:20:00.000Z") },
    });
    await bindClaimToHumanUnit(tx, { taskId: state.escalationTaskId, workerId: worker.id });
  });
  const unit = await prisma.humanWorkUnitRunState.findUniqueOrThrow({
    where: { taskId: state.escalationTaskId },
    select: { claimGeneration: true },
  });
  const workerProjection = await constructionHumanEscalationForWorker({
    taskId: state.escalationTaskId,
    workerId: worker.id,
    claimGeneration: unit.claimGeneration,
  });
  if (!workerProjection) throw new Error("R36_WORKER_PROJECTION_REQUIRED");
  const serializedWorker = JSON.stringify(workerProjection);
  if (/clientPrice|workerPayout|acceptedClientPrice|acceptedWorkerPayout/u.test(serializedWorker)) {
    throw new Error("R36_HUMAN_WORKER_FINANCIAL_LEAK");
  }
  const file = await prisma.file.create({
    data: {
      kind: "deliverable",
      uploaderId: worker.id,
      storageKey: `r36/${crypto.randomUUID()}`,
      fileName: "synthetic-r36-photo.jpg",
      mime: "image/jpeg",
      detectedMime: "image/jpeg",
      sizeBytes: 256,
      scanStatus: "clean",
      sha256: "c".repeat(64),
      scannedAt: new Date("2026-09-02T14:21:00.000Z"),
    },
  });
  const submitted = await submitHumanUnitCandidate({
    taskId: state.escalationTaskId,
    actorId: worker.id,
    claimGeneration: unit.claimGeneration,
    payload: { summary: "Synthetic evidence checked; no fact inferred." },
    fileIds: [file.id],
  });
  if (!submitted.submitted) throw new Error(`R36_HUMAN_SUBMISSION_REFUSED:${submitted.cause}`);
  const opened = await openHumanUnitReview({ taskId: state.escalationTaskId, actorId: reviewer.id });
  if (!opened.opened) throw new Error(`R36_HUMAN_REVIEW_REFUSED:${opened.cause}`);
  const decided = await decideHumanUnitCandidate({ candidateId: submitted.candidateId, actorId: reviewer.id, outcome: "accept" });
  if (!decided.decided) throw new Error(`R36_HUMAN_DECISION_REFUSED:${decided.cause}`);
}

function portalEnvelope(body: string, sourceId: string) {
  return {
    schemaVersion: 1 as const,
    envelopeId: crypto.randomUUID(),
    workspaceId: state.workspaceId,
    occurredAt: "2026-08-31T13:00:00.000Z",
    mode: "APPLY_VALIDATED" as const,
    context: { projectId: null, contactId: null },
    source: { kind: "PORTAL_TEXT" as const, sourceId, text: body },
  };
}

describe("R36 full synthetic internal E2E on disposable PostgreSQL", () => {
  afterAll(() => prisma.$disconnect());

  it("composes the real local services into one sealed 16-checkpoint story", async () => {
    const steps: Record<InternalE2ECheckpointCode, () => Promise<{ observed: Record<string, string | number | boolean | null> | string | number | boolean | null; canonicalState: unknown; externalEffectCount: 0 }>> = {
      ONBOARDING_READY: async () => {
        await prisma.setting.upsert({
          where: { key: "humanWorkUnitResumeEnabled" },
          create: { key: "humanWorkUnitResumeEnabled", value: true },
          update: { value: true },
        });
        const owner = await prisma.user.create({
          data: { name: "R36 owner", email: `r36-owner-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
        });
        const field = await prisma.user.create({
          data: { name: "R36 field", email: `r36-field-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" },
        });
        const workspace = await processOnboardingCommand({ userId: owner.id, command: {
          schemaVersion: 1, action: "INITIALIZE_WORKSPACE", commandId: crypto.randomUUID(),
          name: INTERNAL_E2E_CLOSED_SCENARIO.workspace.name,
          timezone: INTERNAL_E2E_CLOSED_SCENARIO.workspace.timezone,
          locale: INTERNAL_E2E_CLOSED_SCENARIO.workspace.locale,
        } });
        if (workspace.resultType !== "WORKSPACE") throw new Error("R36_WORKSPACE_REQUIRED");
        const project = await processOnboardingCommand({ userId: owner.id, command: {
          schemaVersion: 1, action: "CREATE_FIRST_PROJECT", commandId: crypto.randomUUID(),
          workspaceId: workspace.workspaceId,
          code: INTERNAL_E2E_CLOSED_SCENARIO.project.code,
          name: INTERNAL_E2E_CLOSED_SCENARIO.project.name,
        } });
        if (project.resultType !== "PROJECT") throw new Error("R36_PROJECT_REQUIRED");
        const contact = await processOnboardingCommand({ userId: owner.id, command: {
          schemaVersion: 1, action: "CREATE_FIRST_CONTACT", commandId: crypto.randomUUID(),
          workspaceId: workspace.workspaceId,
          projectId: project.projectId,
          displayName: INTERNAL_E2E_CLOSED_SCENARIO.contact.displayName,
          role: INTERNAL_E2E_CLOSED_SCENARIO.contact.role,
          phone: "+15555550184",
          email: "marc-r36@example.invalid",
        } });
        if (contact.resultType !== "CONTACT") throw new Error("R36_CONTACT_REQUIRED");
        await prisma.constructionWorkspaceMember.create({ data: { workspaceId: workspace.workspaceId, userId: field.id, role: "member", status: "active" } });
        Object.assign(state, { ownerId: owner.id, fieldId: field.id, workspaceId: workspace.workspaceId, projectId: project.projectId, contactId: contact.contactId });
        return {
          observed: { projectCount: 1, contactCount: 1, firstValueReady: contact.firstValueReady },
          canonicalState: { workspace: workspace.workspaceId, project: project.projectId, contact: contact.contactId },
          externalEffectCount: 0,
        };
      },
      CLEAR_APPOINTMENT_STORED_ONCE: async () => {
        state.clearSourceId = crypto.randomUUID();
        state.clearEnvelope = portalEnvelope(INTERNAL_E2E_CLOSED_SCENARIO.appointment.clear, state.clearSourceId);
        const result = await processUnifiedIntent({ userId: state.ownerId, envelope: state.clearEnvelope });
        const count = await prisma.constructionCalendarItem.count({ where: { workspaceId: state.workspaceId, projectId: state.projectId, status: "scheduled" } });
        expect(result.status).toBe("APPLIED");
        expect(count).toBe(1);
        const item = await prisma.constructionCalendarItem.findFirstOrThrow({ where: { workspaceId: state.workspaceId, projectId: state.projectId } });
        return { observed: { appointmentCount: count, result: result.status }, canonicalState: { startsAt: item.startsAt.toISOString(), endsAt: item.endsAt?.toISOString() ?? null, status: item.status }, externalEffectCount: 0 };
      },
      AMBIGUITY_CLARIFIED_NO_WRITE: async () => {
        const before = await prisma.constructionCalendarItem.count({ where: { workspaceId: state.workspaceId } });
        const result = await processUnifiedIntent({ userId: state.ownerId, envelope: portalEnvelope(INTERNAL_E2E_CLOSED_SCENARIO.appointment.ambiguous, crypto.randomUUID()) });
        const after = await prisma.constructionCalendarItem.count({ where: { workspaceId: state.workspaceId } });
        expect(result.status).toBe("CLARIFICATION_REQUIRED");
        expect(after).toBe(before);
        return { observed: { result: result.status, consequentialWrites: after - before }, canonicalState: { before, after, performed: result.transition.performed, validated: result.transition.validated }, externalEffectCount: 0 };
      },
      INVOICE_EVIDENCE_GAPS_BLOCKED: async () => {
        const message = await prisma.constructionMessage.create({ data: {
          workspaceId: state.workspaceId, projectId: state.projectId, direction: "inbound", channel: "portal",
          idempotencyKey: "r36-work-finished-source", sender: `user:${state.ownerId}`, recipients: ["ENDVERA_LOCAL"],
          originalBody: "Travail terminé pour le dosseret.", normalizedBody: "Travail terminé pour le dosseret.", status: "received",
          receivedAt: new Date("2026-09-02T14:00:00.000Z"),
        } });
        const opened = await recordWorkFinished({
          schemaVersion: 1, commandId: "r36-work-finished-command", workspaceId: state.workspaceId,
          projectId: state.projectId, actorId: state.ownerId, sourceMessageId: message.id,
          commandType: "REPORT_WORK_FINISHED",
          claims: { billingBasis: "CHANGE_ORDER", workDescription: "Dosseret de cuisine", amountMinor: 120_000, currency: "CAD", completion: true, approvalState: "APPROVED" },
        });
        state.loopId = opened.loopId;
        state.loopVersion = opened.decision.stateVersion;
        const escalation = await processHumanEscalationCommand({ userId: state.ownerId, command: {
          schemaVersion: 1, commandId: "00000000-0000-4000-8000-000000000936", requestId: "00000000-0000-4000-8000-000000000936", idempotencyKey: "00000000-0000-4000-8000-000000000936",
          workspaceId: state.workspaceId, action: "PREPARE", projectId: state.projectId, openLoopId: state.loopId,
          expectedStateVersion: state.loopVersion, purpose: "OBTAIN_MISSING_EVIDENCE", evidenceKind: "PHOTO",
          acceptedClientPriceCents: 5_000, acceptedWorkerPayoutCents: 2_500, acceptedEstimatedMinutes: 30, acceptedCurrency: "CAD",
        } });
        state.escalationId = escalation.escalationId;
        state.escalationTaskId = (await prisma.constructionHumanEscalation.findUniqueOrThrow({ where: { id: escalation.escalationId }, select: { taskId: true } })).taskId;
        expect(opened.decision.ready).toBe(false);
        expect(opened.decision.missing).toEqual(["SUPPORTING_EVIDENCE", "WRITTEN_APPROVAL"]);
        return { observed: { ready: false, missingCount: opened.decision.missing.length }, canonicalState: opened.decision, externalEffectCount: 0 };
      },
      CONTRADICTION_PRESERVED: async () => {
        const result = await recordOpenLoopContradiction({
          schemaVersion: 1, eventId: "r36-contradiction", userId: state.fieldId, workspaceId: state.workspaceId,
          loopId: state.loopId, expectedStateVersion: state.loopVersion, field: "APPROVAL_STATE",
          claimIds: ["claim-client-approved", "claim-no-written-approval"],
        });
        state.loopVersion = result.decision.stateVersion;
        const contradiction = await prisma.constructionOpenLoopContradiction.findFirstOrThrow({ where: { loopId: state.loopId, status: "open" } });
        state.contradictionId = contradiction.id;
        expect(contradiction.claimIds).toEqual(["claim-client-approved", "claim-no-written-approval"]);
        return { observed: { openContradictionCount: 1, retainedClaimCount: contradiction.claimIds.length }, canonicalState: { field: contradiction.field, claimIds: contradiction.claimIds, status: contradiction.status }, externalEffectCount: 0 };
      },
      AUTHORIZED_RESOLUTION_RECORDED: async () => {
        const result = await resolveOpenLoopContradiction({
          schemaVersion: 1, eventId: "r36-resolve-contradiction", userId: state.ownerId, workspaceId: state.workspaceId,
          loopId: state.loopId, contradictionId: state.contradictionId, expectedStateVersion: state.loopVersion,
          acceptedClaimId: "claim-client-approved", reason: "Owner selected the synthetic written source.",
        });
        state.loopVersion = result.decision.stateVersion;
        const contradiction = await prisma.constructionOpenLoopContradiction.findUniqueOrThrow({ where: { id: state.contradictionId } });
        expect(contradiction.status).toBe("resolved");
        return { observed: { status: contradiction.status, openContradictionCount: result.decision.contradictions.length }, canonicalState: { status: contradiction.status, claimIds: contradiction.claimIds, resolvedByOwner: contradiction.resolvedById === state.ownerId }, externalEffectCount: 0 };
      },
      READY_TO_INVOICE_EXACT: async () => {
        state.approvalInput = {
          schemaVersion: 1, eventId: "r36-written-approval", userId: state.ownerId, workspaceId: state.workspaceId,
          loopId: state.loopId, expectedStateVersion: state.loopVersion, kind: "WRITTEN_APPROVAL", state: "VERIFIED",
          sourceRef: "synthetic://r36/written-approval", contentHash: "a".repeat(64),
        };
        const approval = await addInvoiceReadinessEvidence(state.approvalInput);
        const photo = await addInvoiceReadinessEvidence({
          schemaVersion: 1, eventId: "r36-photo", userId: state.ownerId, workspaceId: state.workspaceId,
          loopId: state.loopId, expectedStateVersion: approval.decision.stateVersion, kind: "PHOTO", state: "VERIFIED",
          sourceRef: "synthetic://r36/photo", contentHash: "b".repeat(64),
        });
        state.loopVersion = photo.decision.stateVersion;
        expect(photo.decision).toMatchObject({ status: "READY_TO_INVOICE", ready: true, nextAction: "PREPARE_INVOICE" });
        return { observed: { status: photo.decision.status, ready: photo.decision.ready, evidenceCount: 2 }, canonicalState: photo.decision, externalEffectCount: 0 };
      },
      PREPARED_ACTIONS_ZERO_DELIVERY: async () => {
        state.preparedRequest = {
          schemaVersion: 1, requestId: "00000000-0000-4000-8000-000000000836", userId: state.ownerId,
          workspaceId: state.workspaceId, loopId: state.loopId, expectedStateVersion: state.loopVersion,
          contactId: state.contactId, channel: "SMS", body: "Bonjour Marc, merci de confirmer la preuve synthétique du dosseret.",
        };
        const prepared = await prepareInvoiceEvidenceRequest(state.preparedRequest);
        state.preparedActionId = prepared.actionId;
        const action = await prisma.constructionAction.findUniqueOrThrow({ where: { id: prepared.actionId } });
        expect(prepared.disposition).toBe("PREPARED_UNSENT");
        expect(action.simulatedDeliveryCount).toBe(0);
        expect(await externalEffectCount()).toBe(0);
        return { observed: { disposition: prepared.disposition, deliveryCount: action.simulatedDeliveryCount, externalEffects: 0 }, canonicalState: { status: action.status, type: action.type, payloadHash: action.payloadHash, deliveryCount: action.simulatedDeliveryCount }, externalEffectCount: 0 };
      },
      HUMAN_ESCALATION_RESUMED_ONCE: async () => {
        await acceptHumanEscalation();
        await prisma.$disconnect();
        await prisma.$connect();
        const first = await recoverHumanEscalationsForOperator({ userId: state.ownerId, workspaceId: state.workspaceId });
        const second = await recoverHumanEscalationsForOperator({ userId: state.ownerId, workspaceId: state.workspaceId });
        expect(first.recovered).toBe(1);
        expect(second.recovered).toBe(0);
        const resumes = await prisma.humanWorkUnitResumeRecord.count({ where: { unitState: { constructionEscalation: { id: state.escalationId } } } });
        expect(resumes).toBe(1);
        return { observed: { firstRecoveryCount: first.recovered, secondRecoveryCount: second.recovered, resumeRecordCount: resumes }, canonicalState: first.cockpit, externalEffectCount: 0 };
      },
      DUPLICATE_REPLAY_REFUSED: async () => {
        const clearReplay = await processUnifiedIntent({ userId: state.ownerId, envelope: state.clearEnvelope });
        const evidenceReplay = await addInvoiceReadinessEvidence(state.approvalInput);
        const actionReplay = await prepareInvoiceEvidenceRequest(state.preparedRequest);
        const counts = {
          appointments: await prisma.constructionCalendarItem.count({ where: { workspaceId: state.workspaceId } }),
          loops: await prisma.constructionOpenLoop.count({ where: { workspaceId: state.workspaceId } }),
          preparedActions: await prisma.constructionAction.count({ where: { id: state.preparedActionId } }),
        };
        expect(clearReplay.transition.replayed).toBe(true);
        expect(evidenceReplay.replayed).toBe(true);
        expect(actionReplay.replayed).toBe(true);
        expect(counts).toEqual({ appointments: 1, loops: 1, preparedActions: 1 });
        return { observed: { replayRefusals: 3, appointments: counts.appointments, loops: counts.loops, preparedActions: counts.preparedActions }, canonicalState: counts, externalEffectCount: 0 };
      },
      RESTART_FINGERPRINT_IDENTICAL: async () => {
        const before = await goldenWorkflowForUser({ userId: state.ownerId, workspaceId: state.workspaceId, now: new Date("2026-09-02T15:00:00.000Z") });
        await prisma.$disconnect();
        await prisma.$connect();
        const after = await goldenWorkflowForUser({ userId: state.ownerId, workspaceId: state.workspaceId, now: new Date("2026-09-02T15:01:00.000Z") });
        state.restartBefore = before.stateFingerprint;
        state.restartAfter = after.stateFingerprint;
        expect(after.stateFingerprint).toBe(before.stateFingerprint);
        expect(after.primaryAction).toEqual(before.primaryAction);
        return { observed: { identical: true, primaryAction: after.primaryAction.code }, canonicalState: { stateFingerprint: after.stateFingerprint, primaryAction: after.primaryAction }, externalEffectCount: 0 };
      },
      FIELD_FINANCIAL_LEAK_ZERO: async () => {
        const projection = await openLoopProjectionForUser({ userId: state.fieldId, workspaceId: state.workspaceId, loopId: state.loopId });
        const human = await humanEscalationCockpitForUser({ userId: state.fieldId, workspaceId: state.workspaceId });
        const serialized = JSON.stringify({ projection, human });
        expect(serialized).not.toMatch(/amountMinor|acceptedClientPrice|acceptedWorkerPayout|clientPrice|workerPayout/u);
        return { observed: { financialLeakCount: 0, projectionRole: "FIELD_WORKER", humanRole: human.role }, canonicalState: { projection, human }, externalEffectCount: 0 };
      },
      CROSS_WORKSPACE_REFUSED: async () => {
        const outsider = await prisma.user.create({ data: { name: "R36 outsider", email: `r36-outsider-${crypto.randomUUID()}@example.invalid`, role: "CLIENT" } });
        let refused = false;
        try {
          await openLoopProjectionForUser({ userId: outsider.id, workspaceId: state.workspaceId, loopId: state.loopId });
        } catch {
          refused = true;
        }
        expect(refused).toBe(true);
        return { observed: { refused }, canonicalState: { refused, disclosedRows: 0 }, externalEffectCount: 0 };
      },
      WEB_IOS_ANDROID_PARITY: async () => {
        const projection = await goldenWorkflowForUser({ userId: state.ownerId, workspaceId: state.workspaceId, now: new Date("2026-09-02T15:10:00.000Z") });
        const web = parseGoldenWorkflowProjection(projection);
        const ios = parseMobileGoldenWorkflow(projection);
        const android = parseMobileGoldenWorkflow(projection);
        const hashes = [sha256Canonical(web), sha256Canonical(ios), sha256Canonical(android)];
        expect(new Set(hashes).size).toBe(1);
        return { observed: { webIosAndroidEqual: true, targetCount: 3 }, canonicalState: { contractHash: hashes[0], stateFingerprint: projection.stateFingerprint }, externalEffectCount: 0 };
      },
      FINAL_NEXT_ACTION_DETERMINISTIC: async () => {
        const first = await goldenWorkflowForUser({ userId: state.ownerId, workspaceId: state.workspaceId, now: new Date("2026-09-02T15:20:00.000Z") });
        const second = await goldenWorkflowForUser({ userId: state.ownerId, workspaceId: state.workspaceId, now: new Date("2026-09-02T15:21:00.000Z") });
        expect(second.primaryAction).toEqual(first.primaryAction);
        expect(second.stateFingerprint).toBe(first.stateFingerprint);
        return { observed: { nextAction: first.primaryAction.code, deterministic: true }, canonicalState: { action: first.primaryAction, fingerprint: first.stateFingerprint }, externalEffectCount: 0 };
      },
      PACKAGE_STILL_VALID: async () => {
        const manifestPath = join(process.cwd(), "release", "endvera-construction-v1", "release-manifest.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
        const validated = validateReleaseManifest({ manifest });
        expect(validated.manifestHash).toBe(manifest.manifestHash);
        expect(await externalEffectCount()).toBe(0);
        return { observed: { packageValid: true, targetCount: 3 }, canonicalState: { manifestHash: validated.manifestHash, targets: validated.targets }, externalEffectCount: 0 };
      },
    };

    expect(Object.keys(steps)).toEqual(INTERNAL_E2E_CHECKPOINT_CODES);
    const report = await runInternalE2EScenario({
      source: {
        head: process.env.R36_SOURCE_HEAD ?? "3".repeat(40),
        tree: process.env.R36_SOURCE_TREE ?? "4".repeat(40),
      },
      steps,
      restartFingerprints: () => ({ before: state.restartBefore, after: state.restartAfter }),
    });
    expect(parseInternalE2EReport(report)).toEqual(report);
    expect(report).toMatchObject({ verdict: "INTERNAL_SYNTHETIC_E2E_PASS", providerObserved: false, externalEffectCount: 0 });
    expect(report.checkpoints.map((item) => item.code)).toEqual(INTERNAL_E2E_CHECKPOINT_CODES);
    expect(await prisma.constructionConnectorOperation.count({ where: { workspaceId: state.workspaceId, externalTransportPerformed: true } })).toBe(0);
    expect(await prisma.constructionMessage.count({ where: {
      workspaceId: state.workspaceId,
      direction: "outbound",
      OR: [{ provider: null }, { NOT: { provider: { startsWith: "ENDVERA_" } } }],
    } })).toBe(0);
    if (process.env.R36_PRINT_REPORT === "1") {
      process.stdout.write(`R36_REPORT_JSON=${JSON.stringify(report)}\n`);
    }
  }, 60_000);
});
