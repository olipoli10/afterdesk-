import { describe, expect, it } from "vitest";
import { createSyntheticAdapter } from "@/server/model-gateway/adapters/synthetic";
import type { AdapterAttemptEnvelope } from "@/server/model-gateway/types";

const hash = (char: string) => `sha256:${char.repeat(64)}`;
const envelope: AdapterAttemptEnvelope = {
  operationId: "op-1",
  attemptId: "attempt-1",
  tenantId: "tenant-1",
  adapterKey: "synthetic",
  billingProvider: "synthetic",
  intermediary: null,
  endpointKey: "messages",
  modelKey: "synthetic-classifier",
  boundedInput: Object.freeze({ title: "Normalize suppliers" }),
  outputContractHash: hash("1"),
  requestEvidenceRef: hash("2"),
  abortSignal: new AbortController().signal,
};

describe("synthetic adapter contract", () => {
  it("makes exactly one transport call for one adapter dispatch", async () => {
    let calls = 0;
    const adapter = createSyntheticAdapter({
      endpointKey: "messages",
      modelKey: "synthetic-classifier",
      transport: async () => {
        calls += 1;
        return { response: { objective: "done" }, inputTokens: 4, outputTokens: 2 };
      },
    });
    await adapter.dispatch(envelope);
    expect(calls).toBe(1);
  });

  it.each([
    ["model", { modelKey: "other-model" }],
    ["endpoint", { endpointKey: "other-endpoint" }],
    ["adapter", { adapterKey: "anthropic-direct" as const }],
  ])("refuses a changed exact %s pin before transport", async (_name, change) => {
    let calls = 0;
    const adapter = createSyntheticAdapter({
      endpointKey: "messages",
      modelKey: "synthetic-classifier",
      transport: async () => {
        calls += 1;
        throw new Error("transport must not run");
      },
    });
    const result = await adapter.dispatch({ ...envelope, ...change });
    expect(result.dispatchKnowledge).toBe("not_dispatched");
    expect(calls).toBe(0);
  });

  it("never hides a retry after a transport error", async () => {
    let calls = 0;
    const adapter = createSyntheticAdapter({
      endpointKey: "messages",
      modelKey: "synthetic-classifier",
      transport: async () => {
        calls += 1;
        throw new Error("synthetic timeout");
      },
    });
    const result = await adapter.dispatch(envelope);
    expect(result).toMatchObject({ dispatchKnowledge: "dispatched_unknown", errorClass: "timeout" });
    expect(calls).toBe(1);
  });

  it.each([
    [402, "provider_refusal"],
    [429, "rate_limit"],
    [401, "authentication"],
    [400, "malformed_request"],
    [503, "provider_server_failure"],
  ])("returns normalized %s failures without a hidden retry", async (status, errorClass) => {
    let calls = 0;
    const adapter = createSyntheticAdapter({
      endpointKey: "messages",
      modelKey: "synthetic-classifier",
      transport: async () => {
        calls += 1;
        throw Object.assign(new Error("fixture"), { status });
      },
    });
    await expect(adapter.dispatch(envelope)).resolves.toMatchObject({
      dispatchKnowledge: "response_received",
      errorClass,
      usage: null,
      httpStatus: status,
    });
    expect(calls).toBe(1);
  });

  it.each([
    ["timeout", new Error("request timed out")],
    ["abort", Object.assign(new Error("request aborted"), { name: "AbortError" })],
  ])("keeps %s as an ambiguous single dispatch", async (_name, error) => {
    let calls = 0;
    const adapter = createSyntheticAdapter({
      endpointKey: "messages",
      modelKey: "synthetic-classifier",
      transport: async () => {
        calls += 1;
        throw error;
      },
    });
    await expect(adapter.dispatch(envelope)).resolves.toMatchObject({
      dispatchKnowledge: "dispatched_unknown",
      errorClass: "timeout",
      usage: null,
    });
    expect(calls).toBe(1);
  });
});
