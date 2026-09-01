import { z } from "zod";
import type { MobileWorkspace } from "@/lib/contracts";

const projectSchema = z
  .object({ id: z.string().min(1), code: z.string().min(1), name: z.string().min(1) })
  .strict();
const contactSchema = z
  .object({ id: z.string().min(1), displayName: z.string().min(1) })
  .strict();

export const mobilePreparedActionInspectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("PREPARED_OUTBOUND_MESSAGE"),
    actionId: z.string().min(1),
    workspaceId: z.string().min(1),
    state: z.enum(["PREPARED_UNSENT", "APPROVED_UNSENT"]),
    channel: z.enum(["SMS", "EMAIL"]),
    recipient: z.string().min(3).max(320),
    body: z.string().min(1).max(1600),
    version: z.number().int().positive(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    project: projectSchema.nullable(),
    contact: contactSchema.nullable(),
    provenance: z
      .object({
        sourceMessageId: z.string().min(1),
        channel: z.enum(["portal", "sms", "email", "voice"]),
        direction: z.enum(["inbound", "outbound"]),
        receivedAt: z.string().datetime().nullable(),
        recordedAt: z.string().datetime(),
      })
      .strict(),
    approval: z
      .object({
        required: z.literal(true),
        approvedVersion: z.number().int().positive().nullable(),
        approvedFingerprint: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
        approvedAt: z.string().datetime().nullable(),
      })
      .strict(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

const decisionBase = {
  schemaVersion: z.literal(1),
  commandId: z.string().uuid(),
  workspaceId: z.string().min(1).max(160),
  actionId: z.string().min(1).max(160),
  expectedVersion: z.number().int().positive(),
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
};

export const mobilePreparedActionDecisionCommandSchema = z.discriminatedUnion(
  "decision",
  [
    z.object({ ...decisionBase, decision: z.literal("APPROVE") }).strict(),
    z
      .object({
        ...decisionBase,
        decision: z.literal("REJECT"),
        reason: z.string().trim().min(1).max(500),
      })
      .strict(),
    z
      .object({
        ...decisionBase,
        decision: z.literal("REVOKE"),
        reason: z.string().trim().min(1).max(500),
      })
      .strict(),
  ],
);

export const mobilePreparedActionDecisionResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.string().uuid(),
    actionId: z.string().min(1),
    decision: z.enum(["APPROVE", "REJECT", "REVOKE"]),
    state: z.enum(["APPROVED_UNSENT", "REJECTED", "REVOKED"]),
    version: z.number().int().positive(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    decidedAt: z.string().datetime(),
    replayed: z.boolean(),
    externalTransportPerformed: z.literal(false),
  })
  .strict();

export type MobilePreparedActionInspection = z.infer<
  typeof mobilePreparedActionInspectionSchema
>;
export type MobilePreparedActionDecisionCommand = z.infer<
  typeof mobilePreparedActionDecisionCommandSchema
>;
export type MobilePreparedActionDecisionResult = z.infer<
  typeof mobilePreparedActionDecisionResultSchema
>;
export type PreparedActionAttemptState =
  | "READY"
  | "SENDING"
  | "CONFIRMED"
  | "REPLAYED"
  | "CONFLICT"
  | "OUTCOME_UNKNOWN"
  | "REFUSED";

export type PreparedActionAttempt = Readonly<{
  command: MobilePreparedActionDecisionCommand;
  state: PreparedActionAttemptState;
  result: MobilePreparedActionDecisionResult | null;
  publicError: string | null;
}>;

function defaultId() {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("MOBILE_RANDOM_ID_UNAVAILABLE");
  }
  return globalThis.crypto.randomUUID();
}

export function preparedActionInspections(actions: readonly unknown[]) {
  return actions.flatMap((value) => {
    if (!value || typeof value !== "object" || !("payload" in value)) return [];
    const parsed = mobilePreparedActionInspectionSchema.safeParse(value.payload);
    return parsed.success ? [parsed.data] : [];
  });
}

export function createPreparedActionAttempt(input: {
  workspace: MobileWorkspace;
  action: MobilePreparedActionInspection;
  decision: "APPROVE" | "REJECT" | "REVOKE";
  reason?: string;
  idFactory?: () => string;
}): PreparedActionAttempt {
  if (
    input.workspace.role === "FIELD_WORKER" ||
    !input.workspace.permissions.canApprovePreparedActions
  ) {
    throw new Error("MOBILE_PREPARED_ACTION_PERMISSION_REFUSED");
  }
  if (input.action.workspaceId !== input.workspace.id) {
    throw new Error("MOBILE_PREPARED_ACTION_WORKSPACE_REFUSED");
  }
  if (
    ["APPROVE", "REJECT"].includes(input.decision) &&
    input.action.state !== "PREPARED_UNSENT"
  ) {
    throw new Error("MOBILE_PREPARED_ACTION_STATE_REFUSED");
  }
  if (
    input.decision === "REVOKE" &&
    input.action.state !== "APPROVED_UNSENT"
  ) {
    throw new Error("MOBILE_PREPARED_ACTION_STATE_REFUSED");
  }
  const command = mobilePreparedActionDecisionCommandSchema.parse({
    schemaVersion: 1,
    commandId: (input.idFactory ?? defaultId)(),
    workspaceId: input.workspace.id,
    actionId: input.action.actionId,
    expectedVersion: input.action.version,
    expectedFingerprint: input.action.fingerprint,
    decision: input.decision,
    ...(input.decision === "APPROVE" ? {} : { reason: input.reason }),
  });
  return Object.freeze({
    command,
    state: "READY",
    result: null,
    publicError: null,
  });
}

export function beginPreparedActionAttempt(value: PreparedActionAttempt) {
  if (value.state !== "READY" && value.state !== "OUTCOME_UNKNOWN") {
    throw new Error("MOBILE_PREPARED_ACTION_ALREADY_DISPATCHED");
  }
  return Object.freeze({ ...value, state: "SENDING" as const, publicError: null });
}

export function finishPreparedActionAttempt(
  value: PreparedActionAttempt,
  input: {
    state: Exclude<PreparedActionAttemptState, "READY" | "SENDING">;
    result?: MobilePreparedActionDecisionResult | null;
    publicError?: string | null;
  },
): PreparedActionAttempt {
  if (value.state !== "SENDING") {
    throw new Error("MOBILE_PREPARED_ACTION_NOT_SENDING");
  }
  return Object.freeze({
    ...value,
    state: input.state,
    result: input.result ?? null,
    publicError: input.publicError ?? null,
  });
}
