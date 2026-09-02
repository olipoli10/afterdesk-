import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createInternalAssistantEnvelope,
  normalizeTrustedAdmittedAssistantSource,
} from "@/server/construction-operating-assistant-r36c/orchestrator";

const request = {
  schemaVersion: 1 as const,
  requestId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "workspace-r36d",
  message: "Qu’est-ce que j’ai aujourd’hui?",
  occurredAt: "2026-09-02T16:00:00.000Z",
};

const admittedSource = {
  senderAddress: `ref_${"a".repeat(64)}`,
  provider: "endvera_sms",
  providerMessageId: "provider-message-r36d",
};

describe("R36D assistant channel routing parity", () => {
  it("preserves the admitted SMS source in the strict internal envelope", () => {
    expect(createInternalAssistantEnvelope({
      userId: "owner-r36d",
      channel: "SMS",
      request,
      admittedSource,
    })).toEqual({
      schemaVersion: 1,
      commandId: request.requestId,
      workspaceId: request.workspaceId,
      channel: "SMS",
      body: request.message,
      occurredAt: request.occurredAt,
      senderAddress: admittedSource.senderAddress,
      provider: admittedSource.provider,
      providerMessageId: admittedSource.providerMessageId,
    });
  });

  it("requires complete admitted metadata for non-portal channels", () => {
    expect(() => normalizeTrustedAdmittedAssistantSource({ channel: "SMS" })).toThrow();
    expect(() => normalizeTrustedAdmittedAssistantSource({
      channel: "VOICE_TRANSCRIPT",
      admittedSource: { ...admittedSource, providerMessageId: "" },
    })).toThrow();
  });

  it("derives portal identity and refuses transport metadata on the portal", () => {
    expect(createInternalAssistantEnvelope({
      userId: "owner-r36d",
      channel: "MOBILE_APP",
      request,
    })).toMatchObject({ channel: "PORTAL", senderAddress: "user:owner-r36d" });
    expect(() => normalizeTrustedAdmittedAssistantSource({
      channel: "MOBILE_APP",
      admittedSource,
    })).toThrow("ASSISTANT_PORTAL_SOURCE_MUST_BE_SERVER_DERIVED");
  });

  it("wires R4 through R36C instead of the direct R2 executor", () => {
    const inbound = readFileSync(
      join(process.cwd(), "src/server/construction-operating-assistant-r4/inbound.ts"),
      "utf8",
    );
    expect(inbound).toContain("processUnifiedAssistantRequest");
    expect(inbound).not.toContain("processOperatingAssistantCommand");
  });
});
