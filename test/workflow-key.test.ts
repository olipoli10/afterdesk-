import { describe, expect, it } from "vitest";
import {
  buildExecutionWorkflowKey,
  deliverableFormatToken,
  volumeBucket,
  type WorkflowKeyInput,
} from "@/lib/operational-intelligence/execution-workflow-key";
import {
  PRICING_POLICY_VERSION,
  QUALITY_POLICY_VERSION,
} from "@/lib/operational-intelligence/policy";

const BASE: WorkflowKeyInput = {
  categorySlug: "list-building",
  deliverableFormat: "CSV matching the provided template",
  unitsRequested: 12,
  verificationLevel: "rigorous",
  sensitiveData: false,
  requiredAccessCount: 0,
  steps: [
    { executor: "ai", humanRole: null, primitiveId: "research.web_search", primitiveVersion: 1 },
    { executor: "ai", humanRole: null, primitiveId: "extract.structured_rows", primitiveVersion: 1 },
    { executor: "deterministic_code", humanRole: null, primitiveId: "build.csv", primitiveVersion: 1 },
    { executor: "human", humanRole: "worker", primitiveId: null, primitiveVersion: null },
  ],
};

describe("the execution workflow key is stable and version-sensitive", () => {
  it("two identical inputs share key and hash, bit for bit", () => {
    const a = buildExecutionWorkflowKey(BASE)!;
    const b = buildExecutionWorkflowKey(structuredClone(BASE))!;
    expect(a.key).toBe(b.key);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a primitiveVersion bump produces a different key", () => {
    // The core moat rule: a new primitive version must never inherit the
    // old version's calibration.
    const bumped = structuredClone(BASE);
    bumped.steps[0].primitiveVersion = 2;
    expect(buildExecutionWorkflowKey(bumped)!.key).not.toBe(buildExecutionWorkflowKey(BASE)!.key);
  });

  it("step order matters — a reordered pipeline is a different workflow", () => {
    const reordered = structuredClone(BASE);
    [reordered.steps[0], reordered.steps[1]] = [reordered.steps[1], reordered.steps[0]];
    expect(buildExecutionWorkflowKey(reordered)!.key).not.toBe(
      buildExecutionWorkflowKey(BASE)!.key
    );
  });

  it("volume buckets group rather than fragment", () => {
    const a = structuredClone(BASE);
    a.unitsRequested = 12;
    const b = structuredClone(BASE);
    b.unitsRequested = 47;
    expect(buildExecutionWorkflowKey(a)!.key).toBe(buildExecutionWorkflowKey(b)!.key);
    const c = structuredClone(BASE);
    c.unitsRequested = 51;
    expect(buildExecutionWorkflowKey(c)!.key).not.toBe(buildExecutionWorkflowKey(a)!.key);
  });

  it("policy versions are NOT in the key — a margin change fragments nothing", () => {
    const { key } = buildExecutionWorkflowKey(BASE)!;
    expect(key).not.toContain(PRICING_POLICY_VERSION);
    expect(key).not.toContain(QUALITY_POLICY_VERSION);
    expect(key).not.toContain("pricing");
    expect(key).not.toContain("cc1");
  });

  it("a plan-less task has no execution identity", () => {
    expect(buildExecutionWorkflowKey({ ...BASE, steps: [] })).toBeNull();
  });

  it("sensitive data or required access flips the access class", () => {
    const sensitive = structuredClone(BASE);
    sensitive.sensitiveData = true;
    expect(buildExecutionWorkflowKey(sensitive)!.key).toContain("private_access");
    const access = structuredClone(BASE);
    access.requiredAccessCount = 2;
    expect(buildExecutionWorkflowKey(access)!.key).toContain("private_access");
    expect(buildExecutionWorkflowKey(BASE)!.key).toContain("public_only");
  });
});

describe("no client text can leak into the key", () => {
  it("a booby-trapped brief contributes nothing recognizable", () => {
    const trapped = structuredClone(BASE);
    trapped.deliverableFormat =
      "Excel workbook for ACME WIDGETS Inc, contact ceo@acmewidgets.example, https://acme.example";
    const { key } = buildExecutionWorkflowKey(trapped)!;
    expect(key).toContain("fmt_spreadsheet");
    for (const fragment of ["acme", "ACME", "ceo@", "http", "example", "Widgets"]) {
      expect(key).not.toContain(fragment);
    }
  });

  it("a hallucinated primitive id collapses to unknown_primitive@0 and leaks nothing", () => {
    // The plan schema deliberately accepts any string as a primitive_id (an
    // unknown one compiles to human work), so a model inventing
    // `extract.acme_widgets_partners` must not write brief-derived prose
    // into a long-lived aggregate key.
    const trapped = structuredClone(BASE);
    trapped.steps[1] = {
      executor: "ai",
      humanRole: null,
      primitiveId: "extract.acme_widgets_partners",
      primitiveVersion: 3,
    };
    const { key } = buildExecutionWorkflowKey(trapped)!;
    expect(key).toContain("unknown_primitive@0");
    for (const fragment of ["acme", "widgets", "partners", "@3"]) {
      expect(key).not.toContain(fragment);
    }
    // Two different hallucinations are identity-wise the same thing: a step
    // no registry will ever run. They must share one key, not fragment.
    const other = structuredClone(trapped);
    other.steps[1].primitiveId = "research.competitor_dossier";
    expect(buildExecutionWorkflowKey(other)!.key).toBe(key);
  });

  it("the deliverable vocabulary is closed — unknown prose maps to fmt_other", () => {
    expect(deliverableFormatToken("a beautifully formatted dossier")).toBe("fmt_other");
    expect(deliverableFormatToken(null)).toBe("fmt_unspecified");
    expect(deliverableFormatToken("csv file")).toBe("fmt_csv");
  });

  it("every key is built from closed tokens only", () => {
    const { key } = buildExecutionWorkflowKey(BASE)!;
    // slug chars, @, >, |, :, digits — nothing else can appear.
    expect(key).toMatch(/^[a-z0-9_.@>|:-]+$/);
  });
});

describe("buckets", () => {
  it("edges land where documented", () => {
    expect(volumeBucket(null)).toBe("q_none");
    expect(volumeBucket(0)).toBe("q_none");
    expect(volumeBucket(1)).toBe("q_1_10");
    expect(volumeBucket(10)).toBe("q_1_10");
    expect(volumeBucket(11)).toBe("q_11_50");
    expect(volumeBucket(100)).toBe("q_51_100");
    expect(volumeBucket(101)).toBe("q_101_500");
    expect(volumeBucket(501)).toBe("q_501_plus");
  });
});
