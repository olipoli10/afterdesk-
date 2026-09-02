import { describe, expect, it } from "vitest";
import {
  fieldHumanEscalationCockpitSchema,
  humanEscalationCommandSchema,
  humanEscalationCommandResultSchema,
  mapHumanEscalationOwnerState,
  ownerHumanEscalationCockpitSchema,
} from "@/lib/construction-operating-assistant-r22/contracts";

const prepareCommand = {
  schemaVersion: 1 as const,
  commandId: "734dfd6b-2de7-4f1d-8dd5-14cb33e01e1c",
  requestId: "734dfd6b-2de7-4f1d-8dd5-14cb33e01e1c",
  idempotencyKey: "734dfd6b-2de7-4f1d-8dd5-14cb33e01e1c",
  workspaceId: "workspace-1",
  action: "PREPARE" as const,
  projectId: "project-1",
  openLoopId: "loop-1",
  expectedStateVersion: 3,
  purpose: "OBTAIN_MISSING_EVIDENCE" as const,
  evidenceKind: "WRITTEN_APPROVAL" as const,
  acceptedClientPriceCents: 8_000,
  acceptedWorkerPayoutCents: 5_000,
  acceptedEstimatedMinutes: 45,
  acceptedCurrency: "CAD" as const,
};

describe("R22 human escalation contracts", () => {
  it("accepts one strict bounded preparation command", () => {
    expect(humanEscalationCommandSchema.parse(prepareCommand)).toEqual(prepareCommand);
    expect(() => humanEscalationCommandSchema.parse({ ...prepareCommand, provider: "external" })).toThrow();
    expect(() => humanEscalationCommandSchema.parse({
      ...prepareCommand,
      acceptedClientPriceCents: 4_000,
    })).toThrow();
  });

  it("keeps owner economics and field visibility structurally disjoint", () => {
    const base = {
      schemaVersion: 1 as const,
      generatedAt: "2026-09-01T12:00:00.000Z",
      workspaceId: "workspace-1",
      externalTransportPerformed: false as const,
    };
    const owner = ownerHumanEscalationCockpitSchema.parse({
      ...base,
      role: "OWNER",
      eligibleLoops: [],
      escalations: [{
        escalationId: "escalation-1",
        projectId: "project-1",
        projectCode: "LAVAL-001",
        projectName: "Rénovation Laval",
        openLoopId: "loop-1",
        purpose: "OBTAIN_MISSING_EVIDENCE",
        evidenceKind: "WRITTEN_APPROVAL",
        state: "PREPARED",
        nextResponsibleRole: "OWNER",
        nextAction: "Autoriser le budget avant de publier le travail humain.",
        deadlineAt: null,
        remainingRevisions: 2,
        sourceStateVersion: 3,
        acceptedClientPriceCents: 8_000,
        acceptedCurrency: "CAD",
        acceptanceId: null,
        acceptedResultHash: null,
        appliedAt: null,
        fundingRequired: true,
        externalTransportPerformed: false,
      }],
    });
    expect(owner.escalations[0]?.acceptedClientPriceCents).toBe(8_000);
    expect(() => fieldHumanEscalationCockpitSchema.parse({
      ...base,
      role: "FIELD_WORKER",
      eligibleLoops: [],
      escalations: [],
      financialDataVisible: false,
      acceptedClientPriceCents: 8_000,
    })).toThrow();
  });

  it("maps canonical Human Work Unit states to an accountable owner action", () => {
    expect(mapHumanEscalationOwnerState({
      escalationState: "prepared",
      unitState: "admitted",
      acceptancePresent: false,
      applied: false,
    })).toEqual({
      state: "PREPARED",
      nextResponsibleRole: "OWNER",
      nextAction: "Autoriser le budget avant de publier le travail humain.",
      fundingRequired: true,
    });
    expect(mapHumanEscalationOwnerState({
      escalationState: "active",
      unitState: "accepted",
      acceptancePresent: true,
      applied: false,
    })).toMatchObject({
      state: "ACCEPTED_PENDING_RESUME",
      nextResponsibleRole: "SYSTEM",
      fundingRequired: false,
    });
    expect(mapHumanEscalationOwnerState({
      escalationState: "resumed",
      unitState: "resumed",
      acceptancePresent: true,
      applied: true,
    })).toMatchObject({ state: "APPLIED", nextResponsibleRole: "NONE" });
  });

  it("pins command results to one canonical zero-transport disposition", () => {
    expect(humanEscalationCommandResultSchema.parse({
      schemaVersion: 1,
      commandId: prepareCommand.commandId,
      workspaceId: prepareCommand.workspaceId,
      action: "PREPARE",
      escalationId: "escalation-1",
      state: "PREPARED",
      replayed: false,
      fundingRequired: true,
      externalTransportPerformed: false,
    })).toMatchObject({ state: "PREPARED", externalTransportPerformed: false });
  });
});
