import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ inspect: vi.fn(), read: vi.fn(), apply: vi.fn(), publication: vi.fn() }));

vi.mock("@/server/model-gateway/personal-intent/operator-ingress-contract", () => ({
  PERSONAL_MODEL_INGRESS_LIMITS: { receiptUtf8: 16384 },
  inspectPersonalModelIngressConfiguration: h.inspect,
}));
vi.mock("@/server/model-gateway/personal-intent/operator-http", () => ({
  personalModelOperatorRequestContext: () => ({
    deadlineAt: Date.now() + 15000,
    monotoneDeadlineAt: performance.now() + 15000,
    signal: new AbortController().signal,
    remaining: () => 10000,
  }),
  readPersonalModelOperatorCommand: h.read,
}));
vi.mock("@/server/model-gateway/personal-intent/operator-ingress", () => ({
  applyPersonalModelOperatorIngress: h.apply,
  assertPersonalModelOperatorIngressPublication: h.publication,
}));
vi.mock("@/server/personal-assistant/credential-cipher", () => ({ requireConnectorKey: () => Buffer.alloc(32) }));

import { OPTIONS, POST } from "../src/app/api/endvera/v1/personal/model/operator-bootstrap/route";

const token = "a".repeat(64);
const setupRef = "12345678-1234-4234-8234-123456789abc";
const receipt = { status: "APPLIED_NOT_ACTIVATED", automaticRetry: false };
const request = () => new Request("https://endvera-core-sandbox.vercel.app/api/endvera/v1/personal/model/operator-bootstrap", {
  method: "POST",
  headers: { "content-type": "application/json", "x-endvera-bootstrap-token": token },
  body: JSON.stringify({ version: "personal-model-setup-command-v1", setupRef, apiKey: "synthetic_key_not_valid_123456789" }),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ENDVERA_PERSONAL_MODEL_BOOTSTRAP_TOKEN", token);
  vi.stubEnv("ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION", "synthetic");
  h.inspect.mockReturnValue({ configuration: { setupRef }, manifest: { ownerUserId: "owner" } });
  h.read.mockResolvedValue({ setupRef, apiKey: "synthetic_key_not_valid_123456789" });
  h.apply.mockResolvedValue(receipt);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("one-time personal model bootstrap diagnostics", () => {
  it("allows only the OpenRouter origin to preflight the one-time bootstrap", async () => {
    const accepted = OPTIONS(new Request("https://endvera-core-sandbox.vercel.app/api/endvera/v1/personal/model/operator-bootstrap", {
      method: "OPTIONS", headers: { origin: "https://openrouter.ai" },
    }));
    expect(accepted.status).toBe(204);
    expect(accepted.headers.get("access-control-allow-origin")).toBe("https://openrouter.ai");
    expect(OPTIONS(new Request("https://endvera-core-sandbox.vercel.app/api/endvera/v1/personal/model/operator-bootstrap", {
      method: "OPTIONS", headers: { origin: "https://evil.invalid" },
    })).status).toBe(403);
  });

  it("keeps absent or invalid bootstrap authorization unavailable", async () => {
    vi.stubEnv("ENDVERA_PERSONAL_MODEL_BOOTSTRAP_TOKEN", "");
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(h.inspect).not.toHaveBeenCalled();
  });

  it("accepts only the exact OpenRouter form handoff with the same token gate", async () => {
    const body = new URLSearchParams({ version: "personal-model-setup-command-v1", setupRef,
      apiKey: "synthetic_key_not_valid_123456789", token });
    const accepted = await POST(new Request("https://endvera-core-sandbox.vercel.app/api/endvera/v1/personal/model/operator-bootstrap", {
      method: "POST", headers: { origin: "https://openrouter.ai", "content-type": "application/x-www-form-urlencoded;charset=utf-8" }, body,
    }));
    expect(accepted.status).toBe(200);
    expect(h.apply).toHaveBeenCalledTimes(1);

    h.apply.mockClear();
    const refused = await POST(new Request("https://endvera-core-sandbox.vercel.app/api/endvera/v1/personal/model/operator-bootstrap", {
      method: "POST", headers: { origin: "https://evil.invalid", "content-type": "application/x-www-form-urlencoded;charset=utf-8" }, body,
    }));
    expect(refused.status).toBe(404);
    expect(h.apply).not.toHaveBeenCalled();
  });

  it("distinguishes configuration and command refusal without reflecting secrets", async () => {
    h.inspect.mockImplementationOnce(() => { throw new Error("secret-config"); });
    const configuration = await POST(request());
    expect(configuration.status).toBe(503);
    expect(await configuration.text()).toBe('{"status":"CONFIGURATION_JSON_PREFIX_115_9","automaticRetry":false}');

    h.read.mockRejectedValueOnce(new Error("secret-key"));
    const command = await POST(request());
    expect(command.status).toBe(400);
    expect(await command.text()).toBe('{"status":"COMMAND_REFUSED","automaticRetry":false}');
  });

  it("normalizes a transport BOM and outer whitespace before inspecting configuration", async () => {
    vi.stubEnv("ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION", "\uFEFF  synthetic  \r\n");
    await POST(request());
    expect(h.inspect).toHaveBeenCalledWith("synthetic");
  });

  it("reassembles a bounded split configuration before inspecting it", async () => {
    vi.stubEnv("ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION_PART_COUNT", "3");
    vi.stubEnv("ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION_PART_1", "syn");
    vi.stubEnv("ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION_PART_2", "the");
    vi.stubEnv("ENDVERA_PERSONAL_MODEL_OPERATOR_SETUP_CONFIGURATION_PART_3", "tic");
    await POST(request());
    expect(h.inspect).toHaveBeenCalledWith("synthetic");
  });

  it("dispatches only an exact setup reference", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(h.apply).toHaveBeenCalledTimes(1);
    expect(h.apply.mock.calls[0]?.[2]).toMatchObject({ diagnosticStages: true });
    h.read.mockResolvedValueOnce({ setupRef: "22345678-1234-4234-8234-123456789abc", apiKey: "synthetic" });
    expect((await POST(request())).status).toBe(404);
    expect(h.apply).toHaveBeenCalledTimes(1);
  });

  it("returns only a bounded setup stage after dispatch", async () => {
    h.apply.mockRejectedValueOnce(new Error("PERSONAL_MODEL_SETUP_STAGE_CREDENTIAL"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "SETUP_STAGE_CREDENTIAL", automaticRetry: false });
  });
});
