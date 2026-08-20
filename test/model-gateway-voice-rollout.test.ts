import { describe, expect, it } from "vitest";
import { resolveVoiceRolloutGate } from "@/server/model-gateway/voice/dispatch";
import { resolveGatewayRolloutGate } from "@/server/model-gateway/dispatch";

describe("independent voice rollout gate", () => {
  it("defaults closed and never opens outside an explicit local fixture", () => {
    expect(resolveVoiceRolloutGate({})).toEqual({ allowed: false, reasonClass: "voice_disabled" });
    expect(resolveVoiceRolloutGate({ environment: "production", voiceEnabled: true }))
      .toEqual({ allowed: false, reasonClass: "voice_disabled" });
    expect(resolveVoiceRolloutGate({ environment: "local", voiceEnabled: true })).toEqual({ allowed: true });
  });

  it("cannot be opened by the classification flag or open classification", () => {
    expect(resolveVoiceRolloutGate({ environment: "local", classificationEnabled: true }))
      .toEqual({ allowed: false, reasonClass: "voice_disabled" });
    expect(resolveGatewayRolloutGate({ environment: "local", classificationEnabled: true }))
      .toEqual({ allowed: true });
    expect(resolveGatewayRolloutGate({ environment: "local", classificationEnabled: false }))
      .toEqual({ allowed: false, reasonClass: "rollout_disabled" });
  });
});
