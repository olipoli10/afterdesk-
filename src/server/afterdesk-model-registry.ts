import "server-only";

export type AfterDeskCoreMode = "plan" | "approve" | "execute";

export type AfterDeskModelRole = "planning" | "execution" | "review";

export type AfterDeskModelProfile = {
  role: AfterDeskModelRole;
  provider: "anthropic";
  model: string;
  effort: "low" | "medium" | "high";
  writesAllowed: false;
  rationale: string;
};

/**
 * Provider-neutral at the workflow boundary, provider-specific only in this
 * registry. The environment overrides let us benchmark a new model without
 * changing contracts, workflows or the MCP surface.
 */
export function modelForRole(role: AfterDeskModelRole): AfterDeskModelProfile {
  switch (role) {
    case "planning":
      return {
        role,
        provider: "anthropic",
        model: process.env.AFTERDESK_PLANNING_MODEL ?? "claude-sonnet-5",
        effort: "medium",
        writesAllowed: false,
        rationale: "Good balance of structured reasoning, latency and cost for a reviewable plan.",
      };
    case "execution":
      return {
        role,
        provider: "anthropic",
        model: process.env.AFTERDESK_EXECUTION_MODEL ?? "claude-haiku-4-5",
        effort: "low",
        writesAllowed: false,
        rationale: "Fast bounded calls for well-defined execution steps; writes remain gated by the engine.",
      };
    case "review":
      return {
        role,
        provider: "anthropic",
        model: process.env.AFTERDESK_REVIEW_MODEL ?? "claude-sonnet-5",
        effort: "medium",
        writesAllowed: false,
        rationale: "Independent, higher-quality verification before a result can be delivered.",
      };
  }
}

export function modePolicy(mode: AfterDeskCoreMode) {
  switch (mode) {
    case "plan":
      return {
        mode,
        executionStarted: false,
        writesAllowed: false,
        approvalRequired: true,
        description: "Read context and produce a reviewable plan only.",
      } as const;
    case "approve":
      return {
        mode,
        executionStarted: false,
        writesAllowed: false,
        approvalRequired: true,
        description: "Show the frozen plan and wait for an explicit human approval.",
      } as const;
    case "execute":
      return {
        mode,
        executionStarted: false,
        writesAllowed: false,
        approvalRequired: true,
        description: "Reserved for a later release; no external write execution is enabled yet.",
      } as const;
  }
}

