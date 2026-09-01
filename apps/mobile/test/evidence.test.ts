import { describe, expect, it } from "vitest";
import {
  beginEvidenceAttempt,
  createEvidenceAttempt,
  finishEvidenceAttempt,
  mobileEvidenceUploadCommandSchema,
  mobileEvidenceUploadResultSchema,
} from "../src/lib/evidence";
import type { MobileWorkspace } from "../src/lib/contracts";

const commandId = "11111111-1111-4111-8111-111111111111";

function workspace(canAddEvidence = true): MobileWorkspace {
  return {
    id: "workspace-1",
    name: "ENDVERA Construction",
    defaultTimezone: "America/Toronto",
    defaultLocale: "fr-CA",
    role: "FIELD_WORKER",
    permissions: {
      financialsVisible: false,
      canManageReceivables: false,
      canScheduleFollowUps: false,
      canApprovePreparedActions: false,
      canAddEvidence,
      externalTransportAuthorized: false,
    },
  };
}

function attempt() {
  return createEvidenceAttempt({
    workspace: workspace(),
    projectId: "project-1",
    loopId: "loop-1",
    expectedStateVersion: 2,
    kind: "PHOTO",
    file: {
      uri: "file:///cache/work.jpg",
      name: "work.jpg",
      mimeType: "image/jpeg",
      size: 128,
    },
    idFactory: () => commandId,
  });
}

describe("native evidence intake contract", () => {
  it("binds one selected file to the exact workspace, project and loop", () => {
    expect(attempt().command).toEqual({
      schemaVersion: 1,
      commandId,
      workspaceId: "workspace-1",
      projectId: "project-1",
      loopId: "loop-1",
      expectedStateVersion: 2,
      kind: "PHOTO",
      fileName: "work.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 128,
      uri: "file:///cache/work.jpg",
    });
  });

  it("keeps one stable command for an outcome-unknown retry", () => {
    const sending = beginEvidenceAttempt(attempt());
    const uncertain = finishEvidenceAttempt(sending, {
      state: "OUTCOME_UNKNOWN",
      publicError: "Résultat inconnu.",
    });
    const retry = beginEvidenceAttempt(uncertain);
    expect(retry.command).toEqual(sending.command);
    expect(retry.state).toBe("SENDING");
  });

  it("allows field evidence but refuses an explicitly disabled permission", () => {
    expect(attempt().command.workspaceId).toBe("workspace-1");
    expect(() =>
      createEvidenceAttempt({
        workspace: workspace(false),
        projectId: "project-1",
        loopId: "loop-1",
        expectedStateVersion: 1,
        kind: "DOCUMENT",
        file: {
          uri: "file:///cache/file.pdf",
          name: "file.pdf",
          mimeType: "application/pdf",
          size: 64,
        },
        idFactory: () => commandId,
      }),
    ).toThrow("MOBILE_EVIDENCE_PERMISSION_REFUSED");
  });

  it("rejects malformed metadata, oversize files and unknown fields", () => {
    expect(() => mobileEvidenceUploadCommandSchema.parse({
      ...attempt().command,
      sizeBytes: 10 * 1024 * 1024 + 1,
    })).toThrow();
    expect(() => mobileEvidenceUploadCommandSchema.parse({
      ...attempt().command,
      mimeType: "text/plain",
    })).toThrow();
    expect(() => mobileEvidenceUploadCommandSchema.parse({
      ...attempt().command,
      providerToken: "forbidden",
    })).toThrow();
  });

  it("accepts only a strict unverified, transport-free result", () => {
    const valid = {
      schemaVersion: 1,
      commandId,
      workspaceId: "workspace-1",
      projectId: "project-1",
      loopId: "loop-1",
      evidenceId: "evidence-1",
      kind: "PHOTO",
      state: "PRESENT_UNVERIFIED",
      stateVersion: 3,
      contentHash: "a".repeat(64),
      fileName: "work.jpg",
      replayed: false,
      externalTransportPerformed: false,
    };
    expect(mobileEvidenceUploadResultSchema.parse(valid)).toEqual(valid);
    expect(() => mobileEvidenceUploadResultSchema.parse({
      ...valid,
      externalTransportPerformed: true,
    })).toThrow();
  });
});
