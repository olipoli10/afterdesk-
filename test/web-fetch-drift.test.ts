import { describe, expect, it, vi } from "vitest";
import type {
  InvocationRecord,
  ArtifactSpec,
  PrimitiveContext,
} from "@/lib/ai-work-engine/primitives/types";

/**
 * THE HOSTILE CONTROL FOR ECONOMIC IMPLEMENTATION DRIFT.
 *
 * Its own file because it must lie about the implementation for the whole
 * module graph: this is a simulation of a FUTURE DEPLOY that swaps the fetch
 * model — the realistic drift, and the one a pinning test cannot catch,
 * because a pinning test describes whatever code it ships beside.
 *
 * The scenario, exactly:
 *
 *   1. a client accepts a mandate; its web.fetch@1 step freezes ac4's $4.00
 *      per-attempt ceiling, which comfortably covers the $1.68 absolute
 *      bound of the Haiku implementation shipping that day;
 *   2. months later a deploy points web.fetch at a 1M-window Opus-class
 *      model — the capability id and version unchanged, every pinning test
 *      rewritten to match the new constants and passing;
 *   3. the accepted mandate runs.
 *
 * Without the runtime guard the provider is called under a contract that
 * funded a fifth of what the implementation can now bill. With it, nothing
 * leaves the process.
 */

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: createMock };
  },
}));

/**
 * The drifted deployment. Same capability, same version, different physics:
 * a 1M-token window at Opus-class rates. absoluteWorstCaseMicros is the REAL
 * function — only the envelope it reads is replaced, so the arithmetic under
 * test is production arithmetic.
 */
vi.mock("@/lib/ai-work-engine/web-fetch-envelope", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/ai-work-engine/web-fetch-envelope")>();
  return {
    ...actual,
    WEB_FETCH_ENVELOPE: {
      ...actual.WEB_FETCH_ENVELOPE,
      model: "claude-opus-5",
      contextWindowTokens: 1_000_000,
      worstInputRateMicrosPerMillion: 10_000_000, // $10/MTok, 1h cache write
      outputRateMicrosPerMillion: 25_000_000, // $25/MTok
    },
  };
});

import { runWebFetch } from "@/lib/ai-work-engine/primitives/fetch";
import {
  WEB_FETCH_ENVELOPE,
  absoluteWorstCaseMicros,
} from "@/lib/ai-work-engine/web-fetch-envelope";

function makeCtx(ceiling: bigint) {
  const invocations: InvocationRecord[] = [];
  const artifacts: ArtifactSpec[] = [];
  const ctx: PrimitiveContext = {
    taskId: "t1",
    runId: "r1",
    stepRunId: "s1",
    snapshotId: "snap-accepted-months-ago",
    order: 2,
    attempt: 1,
    brief: {
      title: "Verify supplier facts",
      description: "d",
      quantity: null,
      objective: "confirm the published price",
      geography: [],
      requiredFields: ["price"],
      quantityInterpreted: null,
    },
    input: {
      rows: [
        {
          unitKey: "unit-1",
          fields: {},
          sources: {},
          status: "needs_review",
          reviewReason: null,
          evidence: [{ url: "https://acme.example/about", text: "title" }],
        },
      ],
      unitsTotal: 1,
      requestedFields: ["price"],
    },
    params: { maxFetches: 3, maxContentTokens: 10_000 },
    inputFiles: [],
    costCeilingMicros: ceiling,
    recordInvocation: async (r) => {
      invocations.push(r);
    },
    writeArtifact: async (spec) => {
      artifacts.push(spec);
      return { fileId: "f1" };
    },
  };
  return { ctx, invocations, artifacts };
}

describe("a deploy that changes the implementation cannot spend an accepted contract's money", () => {
  it("is not vacuous: the drift really is in place and really is more expensive", () => {
    // If the mock silently failed, this file would prove nothing at all.
    expect(WEB_FETCH_ENVELOPE.model).toBe("claude-opus-5");
    expect(WEB_FETCH_ENVELOPE.primitiveVersion).toBe(1); // capability UNCHANGED
    // 4 x (1,000,000 x $10/M + 4,000 x $25/M) = 4 x $10.10 = $40.40.
    expect(absoluteWorstCaseMicros(WEB_FETCH_ENVELOPE, 3)).toBe(40_400_000n);
  });

  it("the provider is never called: refused before dispatch, at the frozen ceiling", async () => {
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "should never happen", citations: [] }],
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: "end_turn",
    });
    // The ceiling ac4 froze for this step, which funded the OLD implementation.
    const { ctx, invocations, artifacts } = makeCtx(4_000_000n);

    await expect(runWebFetch(ctx)).rejects.toThrow(/economic implementation drift/);

    expect(createMock).not.toHaveBeenCalled();
    expect(artifacts).toHaveLength(0);
    expect(invocations).toHaveLength(1);
    expect(invocations[0].dispatchState).toBe("cancelled_before_dispatch");
    expect(invocations[0].costMicros).toBe(0);
    expect(invocations[0].inputTokens).toBe(0);
    expect(invocations[0].outputTokens).toBe(0);
    // The row names the implementation that was refused, so an operator
    // reading it learns WHICH deploy broke the contract.
    expect(invocations[0].model).toBe("claude-opus-5");
    expect(invocations[0].error).toContain("40400000");
    expect(invocations[0].error).toContain("4000000");
  });

  it("and the same drift is admitted through, correctly, when a contract DID fund it", async () => {
    /**
     * The boundary is the frozen ceiling, not the model's name. A mandate
     * quoted under a policy that funded $40.40 per attempt may run this
     * implementation: the guard refuses spend the contract never authorised,
     * never spend it did. Without this, "fails closed" would be
     * indistinguishable from "never runs".
     */
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "no fetch performed", citations: [] }],
      usage: {
        input_tokens: 100,
        output_tokens: 10,
        server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
      },
      stop_reason: "end_turn",
    });
    const { ctx } = makeCtx(41_000_000n);
    await runWebFetch(ctx);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
