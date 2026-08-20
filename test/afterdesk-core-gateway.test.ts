import { describe, expect, it } from "vitest";
import {
  AFTERDESK_MCP_PROTOCOL_VERSION,
  handleAfterDeskMcpRequest,
} from "@/server/afterdesk-core-gateway";

describe("AfterDesk Core MCP gateway", () => {
  it("performs the MCP initialize handshake", async () => {
    const response = await handleAfterDeskMcpRequest({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(response?.result).toMatchObject({
      protocolVersion: AFTERDESK_MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "afterdesk-core" },
    });
  });

  it("exposes only the first read-only tools", async () => {
    const response = await handleAfterDeskMcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tools = (response?.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.map((tool) => tool.name)).toEqual(["get_project_context", "plan_project_work"]);
  });

  it("returns a project context without exposing write actions", async () => {
    const response = await handleAfterDeskMcpRequest(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_project_context", arguments: { projectId: "afterdesk" } },
      },
      { loadStats: async () => ({ taskCount: 4, tasksByStatus: { submitted: 4 }, workflowRunCount: 1, aiOperationCount: 2 }) }
    );
    const result = response?.result as { structuredContent: { writeActionsEnabled: boolean; stats: unknown } };
    expect(result.structuredContent.writeActionsEnabled).toBe(false);
    expect(result.structuredContent.stats).toEqual({
      taskCount: 4,
      tasksByStatus: { submitted: 4 },
      workflowRunCount: 1,
      aiOperationCount: 2,
    });
  });

  it("recommends plan mode and a metered planning model", async () => {
    const response = await handleAfterDeskMcpRequest({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "get_project_context", arguments: { projectId: "afterdesk" } },
    });
    const context = (response?.result as { structuredContent: { recommendedMode: string; recommendedModel: { model: string; writesAllowed: boolean } } }).structuredContent;
    expect(context.recommendedMode).toBe("plan");
    expect(context.recommendedModel.model).toBe("claude-sonnet-5");
    expect(context.recommendedModel.writesAllowed).toBe(false);
  });

  it("plans without starting execution or calling an external provider", async () => {
    const response = await handleAfterDeskMcpRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "plan_project_work",
        arguments: { projectId: "afterdesk", goal: "Compare new AI models and benchmark performance", mode: "plan" },
      },
    });
    const result = response?.result as { structuredContent: { executionStarted: boolean; steps: Array<{ action: string }> } };
    expect(result.structuredContent.executionStarted).toBe(false);
    expect(result.structuredContent.steps.map((step) => step.action)).toContain("select_research_and_model_capabilities");
  });

  it("can attach a generated, still read-only model plan behind the gateway", async () => {
    const response = await handleAfterDeskMcpRequest(
      {
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: { name: "plan_project_work", arguments: { goal: "Benchmark the planning workflow" } },
      },
      {
        runPlan: async () => ({
          ok: true as const,
          model: "claude-sonnet-5",
          costMicros: 1234,
          plan: { summary: "test plan", steps: [], assumptions: [], risks: [], nextAction: "review" },
        }),
      }
    );
    const result = response?.result as { structuredContent: { model: string; costMicros: number; modelPlan: { summary: string } } };
    expect(result.structuredContent.model).toBe("claude-sonnet-5");
    expect(result.structuredContent.costMicros).toBe(1234);
    expect(result.structuredContent.modelPlan.summary).toBe("test plan");
  });

  it("fails closed for invalid tools and project ids", async () => {
    const unknown = await handleAfterDeskMcpRequest({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "delete_everything", arguments: {} },
    });
    expect(unknown?.error?.code).toBe(-32602);

    const invalidProject = await handleAfterDeskMcpRequest({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "get_project_context", arguments: { projectId: "other" } },
    });
    expect(invalidProject?.error?.code).toBe(-32602);
  });

  it("does not respond to MCP notifications", async () => {
    const response = await handleAfterDeskMcpRequest({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(response).toBeNull();
  });
});
