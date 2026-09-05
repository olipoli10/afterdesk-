import { describe, expect, it } from "vitest";
import {
  classifyTextAssistRequest,
  textAssistFoundationManifest,
  textAssistFoundationManifestSchema,
} from "@/lib/construction-operating-assistant-r38a/text-assist-foundation";

describe("R38A TextAssist foundation", () => {
  it("uses a dedicated number without broad device SMS or call-log access", () => {
    const manifest = textAssistFoundationManifestSchema.parse(textAssistFoundationManifest());
    const sms = manifest.entryChannels.find((channel) => channel.key === "DEDICATED_SMS");
    expect(sms).toMatchObject({ readiness: "NOT_PROVISIONED", deviceSmsPermissionRequired: false, externalTransportPerformed: false });
    expect(manifest.forbiddenDevicePermissions).toEqual(["READ_SMS", "WRITE_SMS", "READ_CALL_LOG", "WRITE_CALL_LOG"]);
    expect(manifest.protectedResources.every((resource) => resource.requestTiming === "ON_FIRST_USE")).toBe(true);
  });

  it("keeps OpenRouter server-only, disabled and outside action authority", () => {
    const manifest = textAssistFoundationManifest();
    expect(manifest.modelGateway).toEqual({
      architecture: "PROVIDER_NEUTRAL",
      candidate: "OPENROUTER",
      readiness: "DISABLED_LOCAL",
      secretLocation: "SERVER_ONLY",
      budgetEnforced: true,
      dataPolicyRequired: true,
    });
    expect(manifest.actionBoundary.externalWritePreviewRequired).toBe(true);
    expect(manifest.actionBoundary.externalWriteApprovalRequired).toBe(true);
    expect(manifest.externalTransportPerformed).toBe(false);
  });

  it("routes canonical questions locally and current research to a disabled provider lane", () => {
    expect(classifyTextAssistRequest({ body: "Qu’est-ce que j’ai au calendrier demain?", senderVerified: true, workspaceBound: true })).toMatchObject({ lane: "CANONICAL_OPERATIONS", readiness: "LOCAL_READY", outcome: "ROUTE_READY" });
    expect(classifyTextAssistRequest({ body: "Recherche les nouvelles règles actuelles sur le web", senderVerified: true, workspaceBound: true })).toMatchObject({ lane: "EXTERNAL_RESEARCH", readiness: "PROVIDER_REQUIRED_NOT_AUTHORIZED", outcome: "REFUSAL", externalTransportPerformed: false });
  });

  it("refuses unverified identities before routing", () => {
    expect(classifyTextAssistRequest({ body: "Qu’est-ce que j’ai demain?", senderVerified: false, workspaceBound: true })).toMatchObject({ lane: null, readiness: "IDENTITY_REQUIRED", outcome: "REFUSAL" });
  });

  it("prepares external writes with an exact preview and no transport", () => {
    expect(classifyTextAssistRequest({ body: "Texte Marc pour confirmer demain", senderVerified: true, workspaceBound: true, requestsExternalWrite: true })).toEqual({
      schemaVersion: 1,
      lane: "CANONICAL_OPERATIONS",
      outcome: "PREPARED_ACTION",
      readiness: "LOCAL_READY",
      reasonCode: "R38A_EXTERNAL_WRITE_PREPARED_ONLY",
      exactPreviewRequired: true,
      externalTransportPerformed: false,
    });
  });
});
