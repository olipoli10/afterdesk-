import { describe, expect, it } from "vitest";
import preflight from "../specs/204-design-partner-pilot-preflight/PILOT_PREFLIGHT.json";
import {
  DESIGN_PARTNER_PILOT_METRICS,
  designPartnerPilotPreflightSchema,
  evaluateDesignPartnerPilotPreflight,
} from "../src/lib/construction-operating-assistant-r39a/contracts";

describe("R39A design-partner pilot preflight", () => {
  it("freezes three empty slots, the full metric set and all six stop conditions", () => {
    const parsed = designPartnerPilotPreflightSchema.parse(preflight);
    expect(parsed.participantSlots.map((slot) => slot.slot)).toEqual([1, 2, 3]);
    expect(parsed.participantSlots.every((slot) => slot.participantRef === null)).toBe(true);
    expect(parsed.requiredMetrics).toEqual(DESIGN_PARTNER_PILOT_METRICS);
    expect(new Set(parsed.stopConditions)).toHaveLength(6);
  });

  it("proves only local preflight and refuses to fabricate pilot readiness", () => {
    expect(evaluateDesignPartnerPilotPreflight(preflight)).toEqual({
      schemaVersion: 1,
      campaignId: "R39-DESIGN-PARTNER-PILOT-V1",
      verdict: "BLOCKED_EXTERNAL_AUTHORITY",
      localPreflightComplete: true,
      admittedDesignPartners: 0,
      recordedCustomerData: false,
      providerCalls: 0,
      externalTransports: 0,
      missingAuthority: [
        "DESIGN_PARTNER_CONTACT_AND_CONSENT",
        "CUSTOMER_DATA_SCOPE",
        "PROVIDER_AND_TRANSPORT_SCOPE",
      ],
    });
  });

  it("rejects invented participants, enabled transport and incomplete metrics", () => {
    expect(() => designPartnerPilotPreflightSchema.parse({
      ...preflight,
      participantSlots: preflight.participantSlots.map((slot, index) =>
        index === 0 ? { ...slot, status: "ADMITTED", participantRef: "contractor-1" } : slot,
      ),
    })).toThrow();
    expect(() => designPartnerPilotPreflightSchema.parse({
      ...preflight,
      authority: { ...preflight.authority, externalTransportAuthorized: true },
    })).toThrow();
    expect(() => designPartnerPilotPreflightSchema.parse({
      ...preflight,
      requiredMetrics: preflight.requiredMetrics.slice(1),
    })).toThrow();
  });
});
