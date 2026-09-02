import type {
  GoldenWorkflowActionCode,
  GoldenWorkflowBlockerCode,
  GoldenWorkflowRoute,
  GoldenWorkflowStep,
} from "./contracts";

export type GoldenWorkflowRegistryEntry = {
  step: GoldenWorkflowStep;
  order: number;
  route: GoldenWorkflowRoute;
  titleKey: `step.${Lowercase<GoldenWorkflowStep>}.title`;
  bodyKey: `step.${Lowercase<GoldenWorkflowStep>}.body`;
  action: GoldenWorkflowActionCode;
  blocker: GoldenWorkflowBlockerCode | null;
  fieldAllowed: boolean;
};

export const GOLDEN_WORKFLOW_REGISTRY = [
  { step: "GET_STARTED", order: 1, route: "ONBOARDING", titleKey: "step.get_started.title", bodyKey: "step.get_started.body", action: "START_ONBOARDING", blocker: "PROJECT_REQUIRED", fieldAllowed: false },
  { step: "CAPTURE_WORK", order: 2, route: "ASSISTANT", titleKey: "step.capture_work.title", bodyKey: "step.capture_work.body", action: "OPEN_ASSISTANT", blocker: "WORK_INTENT_REQUIRED", fieldAllowed: false },
  { step: "PLAN_WORK", order: 3, route: "JOBS", titleKey: "step.plan_work.title", bodyKey: "step.plan_work.body", action: "PLAN_JOB", blocker: "SCHEDULE_REQUIRED", fieldAllowed: true },
  { step: "COLLECT_PROOF", order: 4, route: "EVIDENCE", titleKey: "step.collect_proof.title", bodyKey: "step.collect_proof.body", action: "ADD_EVIDENCE", blocker: "EVIDENCE_REQUIRED", fieldAllowed: true },
  { step: "FOLLOW_UP", order: 5, route: "FOLLOW_UPS", titleKey: "step.follow_up.title", bodyKey: "step.follow_up.body", action: "PLAN_FOLLOW_UP", blocker: "FOLLOW_UP_REQUIRED", fieldAllowed: false },
  { step: "READY_TO_INVOICE", order: 6, route: "RECEIVABLES", titleKey: "step.ready_to_invoice.title", bodyKey: "step.ready_to_invoice.body", action: "REVIEW_INVOICE_READINESS", blocker: "INVOICE_EVIDENCE_REQUIRED", fieldAllowed: false },
  { step: "APPROVE_ACTION", order: 7, route: "ACTIONS", titleKey: "step.approve_action.title", bodyKey: "step.approve_action.body", action: "REVIEW_PREPARED_ACTION", blocker: "PREPARED_ACTION_REQUIRED", fieldAllowed: false },
  { step: "REVIEW_HISTORY", order: 8, route: "TIMELINE", titleKey: "step.review_history.title", bodyKey: "step.review_history.body", action: "REVIEW_HISTORY", blocker: null, fieldAllowed: true },
] as const satisfies readonly GoldenWorkflowRegistryEntry[];

export const EXTERNAL_CAPABILITY_CODES = ["CALENDAR_SYNC", "SMS_MMS", "VOICE_CALL", "EMAIL", "ACCOUNTING"] as const;

export const WEB_ROUTES: Record<GoldenWorkflowRoute, string> = {
  ONBOARDING: "/client/onboarding",
  ASSISTANT: "/client/assistant",
  PROJECTS: "/client/projects",
  JOBS: "/client/calendar",
  CALENDAR: "/client/calendar",
  EVIDENCE: "/client/projects",
  FOLLOW_UPS: "/client/inbox",
  RECEIVABLES: "/client/projects",
  ACTIONS: "/client/inbox",
  TIMELINE: "/client/projects",
  PROVENANCE: "/client/projects",
  HUMAN_SUPPORT: "/client/cockpit",
  COCKPIT: "/client/cockpit",
};

export const MOBILE_ROUTES: Record<GoldenWorkflowRoute, string> = {
  ONBOARDING: "/onboarding",
  ASSISTANT: "/assistant",
  PROJECTS: "/projects",
  JOBS: "/jobs",
  CALENDAR: "/calendar",
  EVIDENCE: "/evidence",
  FOLLOW_UPS: "/follow-ups",
  RECEIVABLES: "/receivables",
  ACTIONS: "/actions",
  TIMELINE: "/timeline",
  PROVENANCE: "/provenance",
  HUMAN_SUPPORT: "/human-support",
  COCKPIT: "/",
};
