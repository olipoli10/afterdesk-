import { createHash } from "node:crypto";
import { EXECUTION_KEY_VERSION } from "@/lib/operational-intelligence/policy";
import { PLAN_PRIMITIVES } from "@/lib/ai-work-engine/primitive-vocabulary";

/**
 * THE EXECUTION WORKFLOW KEY — what "comparable tasks" means, in one pure
 * function.
 *
 * The key describes WHAT IS DONE: category, deliverable shape, volume
 * bucket, verification bar, access class, and the exact ordered signature of
 * the accepted plan's steps (primitive@version for machine steps, the human
 * role for human ones). Two tasks share a key iff the same machinery and
 * the same kind of human work produce the same kind of output.
 *
 * The key deliberately EXCLUDES pricing and quality policy versions: a
 * margin change does not alter what a workflow does, and fragmenting the
 * operational history every time the catalog moves would reset calibration
 * for no operational reason. Those versions travel as separate columns.
 *
 * PRIVACY IS STRUCTURAL, NOT FILTERED. Every dimension is a closed enum, a
 * category slug we authored, a bucket, or a primitive id from our own
 * registry. The one classification field that carries model prose —
 * deliverable_format — is reduced to a closed vocabulary by keyword match
 * below, so a brief titled "Acme Widgets Q3 partner list" cannot leak one
 * character into the key. A test feeds a booby-trapped brief and asserts.
 */

export type WorkflowKeyStepInput = {
  executor: "ai" | "human" | "deterministic_code";
  humanRole: string | null;
  primitiveId: string | null;
  primitiveVersion: number | null;
};

export type WorkflowKeyInput = {
  categorySlug: string | null;
  deliverableFormat: string | null;
  unitsRequested: number | null;
  verificationLevel: string | null;
  sensitiveData: boolean | null;
  requiredAccessCount: number | null;
  /** The ACCEPTED plan version's steps, in order. */
  steps: WorkflowKeyStepInput[];
};

export type ExecutionWorkflowKey = {
  key: string;
  hash: string;
  version: number;
};

/** Closed vocabulary for the deliverable — model prose never enters the key. */
export function deliverableFormatToken(raw: string | null): string {
  if (!raw) return "fmt_unspecified";
  const s = raw.toLowerCase();
  if (s.includes("csv")) return "fmt_csv";
  if (s.includes("xlsx") || s.includes("excel") || s.includes("spreadsheet") || s.includes("workbook"))
    return "fmt_spreadsheet";
  if (s.includes("pdf")) return "fmt_pdf";
  if (s.includes("docx") || s.includes("word") || s.includes("document")) return "fmt_document";
  if (s.includes("report") || s.includes("summary") || s.includes("brief")) return "fmt_report";
  if (s.includes("list")) return "fmt_list";
  if (s.includes("crm") || s.includes("import")) return "fmt_crm_import";
  return "fmt_other";
}

export function volumeBucket(units: number | null): string {
  if (units === null || units <= 0) return "q_none";
  if (units <= 10) return "q_1_10";
  if (units <= 50) return "q_11_50";
  if (units <= 100) return "q_51_100";
  if (units <= 500) return "q_101_500";
  return "q_501_plus";
}

function stepToken(step: WorkflowKeyStepInput): string {
  if (step.primitiveId !== null) {
    /**
     * CLOSED against the registry vocabulary, not against the planner's
     * output: the plan schema deliberately accepts any string as a
     * primitive_id (an unknown one simply compiles to human work), so a
     * model hallucinating `extract.acme_widgets_partners` would otherwise
     * write brief-derived prose into a long-lived aggregate key. Unknown
     * ids collapse to one token — identity-wise they are all the same
     * thing: a step no registry will ever run.
     */
    if (!Object.hasOwn(PLAN_PRIMITIVES, step.primitiveId)) {
      return "unknown_primitive@0";
    }
    return `${step.primitiveId}@${step.primitiveVersion ?? 0}`;
  }
  if (step.executor === "human") {
    return `human:${step.humanRole ?? "worker"}`;
  }
  // A code/ai step that never committed to a primitive compiles to human
  // work (Phase 1B rule), but the PLAN said something different, and the key
  // describes the plan the client accepted, not the compiler's demotion.
  return `${step.executor === "deterministic_code" ? "code" : "ai"}:unbound`;
}

/**
 * Null when there is no plan: a task quoted without steps has no execution
 * identity, and inventing a "no_plan" workflow would pool tasks that share
 * nothing but the absence of structure.
 */
export function buildExecutionWorkflowKey(input: WorkflowKeyInput): ExecutionWorkflowKey | null {
  if (input.steps.length === 0) return null;

  const accessClass =
    input.sensitiveData === true || (input.requiredAccessCount ?? 0) > 0
      ? "private_access"
      : "public_only";

  const key = [
    input.categorySlug ?? "uncategorized",
    deliverableFormatToken(input.deliverableFormat),
    volumeBucket(input.unitsRequested),
    input.verificationLevel ?? "standard",
    accessClass,
    input.steps.map(stepToken).join(">"),
    `k${EXECUTION_KEY_VERSION}`,
  ].join("|");

  return {
    key,
    hash: createHash("sha256").update(key, "utf8").digest("hex"),
    version: EXECUTION_KEY_VERSION,
  };
}
