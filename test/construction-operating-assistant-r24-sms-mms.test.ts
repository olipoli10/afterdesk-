import { describe, expect, it } from "vitest";
import {
  messagingInboundEventSchema,
  messagingPolicyCommandSchema,
  messagingDeliveryObservationSchema,
} from "@/lib/construction-operating-assistant-r24/contracts";
import {
  classifyMessagingKeyword,
  deriveMessagingPermission,
  nextDeliveryStatus,
  opaqueContactMessagingRef,
} from "@/lib/construction-operating-assistant-r24/policy";

describe("R24 SMS/MMS contracts and policy", () => {
  it("accepts text and selected-evidence MMS but rejects raw provider media", () => {
    const base = {
      schemaVersion: 1 as const,
      eventId: "f9d70375-d54f-475f-8bc8-d283c2559288",
      workspaceId: "workspace-1",
      senderIdentityRef: `ref_${"a".repeat(64)}`,
      occurredAt: "2026-09-02T00:00:00.000Z",
    };
    expect(messagingInboundEventSchema.safeParse({
      ...base,
      kind: "SMS_TEXT",
      body: "LAVAL-001 — les fenêtres sont prêtes.",
      mediaReferences: [],
    }).success).toBe(true);
    expect(messagingInboundEventSchema.safeParse({
      ...base,
      kind: "MMS",
      body: "Photo du dosseret.",
      mediaReferences: [{
        evidenceId: "evidence-1",
        contentHash: "b".repeat(64),
        kind: "PHOTO",
      }],
    }).success).toBe(true);
    expect(messagingInboundEventSchema.safeParse({
      ...base,
      kind: "MMS",
      body: "Photo",
      mediaReferences: [],
      mediaUrl: "https://provider.invalid/file",
    }).success).toBe(false);
  });

  it("classifies opt-out conservatively", () => {
    expect(classifyMessagingKeyword(" STOP ")).toBe("STOP");
    expect(classifyMessagingKeyword("arrête")).toBe("STOP");
    expect(classifyMessagingKeyword("START")).toBe("START_REVIEW_REQUIRED");
    expect(classifyMessagingKeyword("AIDE")).toBe("HELP");
    expect(classifyMessagingKeyword("Le matériel est prêt")).toBe("NONE");
  });

  it("requires purpose consent and refuses every suppression state", () => {
    expect(deriveMessagingPermission({ consentStatus: "granted", suppressionStatus: "allowed" }))
      .toEqual({ allowed: true, reason: "CONSENT_GRANTED" });
    expect(deriveMessagingPermission({ consentStatus: "unknown", suppressionStatus: "allowed" }))
      .toEqual({ allowed: false, reason: "CONSENT_REQUIRED" });
    expect(deriveMessagingPermission({ consentStatus: "granted", suppressionStatus: "suppressed" }))
      .toEqual({ allowed: false, reason: "CONTACT_SUPPRESSED" });
    expect(deriveMessagingPermission({ consentStatus: "granted", suppressionStatus: "review_required" }))
      .toEqual({ allowed: false, reason: "CONSENT_REVIEW_REQUIRED" });
  });

  it("never grants consent from START and rejects unknown command fields", () => {
    const base = {
      schemaVersion: 1 as const,
      action: "RECORD_CONSENT" as const,
      commandId: "2fefc7d8-08ae-448e-902a-141fba9686ce",
      workspaceId: "workspace-1",
      contactId: "contact-1",
      purpose: "service" as const,
      evidenceRef: `consent_${"c".repeat(64)}`,
      expectedStateVersion: 0,
    };
    expect(messagingPolicyCommandSchema.safeParse(base).success).toBe(true);
    expect(messagingPolicyCommandSchema.safeParse({ ...base, rawPhone: "+15555550184" }).success)
      .toBe(false);
  });

  it("accepts only monotonic synthetic delivery observations", () => {
    expect(nextDeliveryStatus(null, "PREPARED")).toEqual({ accepted: true, rank: 10 });
    expect(nextDeliveryStatus("SENT", "DELIVERED")).toEqual({ accepted: true, rank: 40 });
    expect(nextDeliveryStatus("DELIVERED", "SENT")).toEqual({
      accepted: false,
      reason: "DELIVERY_STATE_REGRESSION",
    });
    expect(messagingDeliveryObservationSchema.safeParse({
      schemaVersion: 1,
      eventId: "13c72ff5-9dc8-4276-aeae-d7967fb45271",
      workspaceId: "workspace-1",
      operationId: "operation-1",
      providerEventRef: `event_${"d".repeat(64)}`,
      status: "DELIVERED",
      proofLevel: "SYNTHETIC_LOCAL",
      observedAt: "2026-09-02T00:01:00.000Z",
      externalTransportPerformed: false,
    }).success).toBe(true);
  });

  it("builds stable opaque contact refs without the contact address", () => {
    const value = opaqueContactMessagingRef({ workspaceId: "workspace-1", contactId: "contact-1" });
    expect(value).toMatch(/^ref_[a-f0-9]{64}$/u);
    expect(value).not.toContain("contact-1");
  });
});
