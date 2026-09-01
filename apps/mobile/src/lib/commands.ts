import { z } from "zod";
import type { MobileWorkspace } from "@/lib/contracts";

export type AttemptState =
  | "READY"
  | "SENDING"
  | "CONFIRMED"
  | "REPLAYED"
  | "CONFLICT"
  | "OUTCOME_UNKNOWN"
  | "REFUSED";

const receivableCommandSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.string().min(1),
    type: z.literal("RECORD_RECEIVABLE"),
    payload: z
      .object({
        idempotencyKey: z.string().min(1),
        workspaceId: z.string().min(1),
        projectId: z.string().min(1),
        contactId: z.string().min(1).nullable(),
        invoiceReference: z.string().trim().min(1),
        amountMinor: z.number().int().positive(),
        currency: z.literal("CAD"),
        issuedAt: z.string().datetime(),
        dueAt: z.string().datetime(),
        sourceRef: z.string().trim().min(1),
      })
      .strict(),
  })
  .strict();

const paymentCommandSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.string().min(1),
    type: z.literal("RECORD_PAYMENT"),
    payload: z
      .object({
        eventId: z.string().min(1),
        workspaceId: z.string().min(1),
        receivableId: z.string().min(1),
        expectedVersion: z.number().int().positive(),
        amountMinor: z.number().int().positive(),
        receivedAt: z.string().datetime(),
        sourceRef: z.string().trim().min(1),
        note: z.string().trim().min(1).nullable(),
      })
      .strict(),
  })
  .strict();

const followUpCommandSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.string().min(1),
    type: z.literal("SCHEDULE_FOLLOW_UP"),
    payload: z
      .object({
        idempotencyKey: z.string().min(1),
        workspaceId: z.string().min(1),
        projectId: z.string().min(1),
        contactId: z.string().min(1),
        target: z.discriminatedUnion("kind", [
          z
            .object({
              kind: z.literal("RECEIVABLE_PAYMENT"),
              receivableId: z.string().min(1),
            })
            .strict(),
          z
            .object({
              kind: z.literal("MISSING_EVIDENCE"),
              openLoopId: z.string().min(1),
            })
            .strict(),
        ]),
        dueAt: z.string().datetime(),
        channel: z.enum(["SMS", "EMAIL", "HUMAN_CALL"]),
        body: z.string().trim().min(1).max(1_600),
      })
      .strict(),
  })
  .strict();

export const mobileCommandSchema = z.discriminatedUnion("type", [
  receivableCommandSchema,
  paymentCommandSchema,
  followUpCommandSchema,
]);
export type MobileCommand = z.infer<typeof mobileCommandSchema>;

export type CommandAttempt = Readonly<{
  command: MobileCommand;
  state: AttemptState;
  publicError: string | null;
}>;

function defaultId() {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("MOBILE_RANDOM_ID_UNAVAILABLE");
  }
  return globalThis.crypto.randomUUID();
}

function attempt(command: MobileCommand): CommandAttempt {
  return Object.freeze({ command: mobileCommandSchema.parse(command), state: "READY", publicError: null });
}

export function createReceivableAttempt(
  input: Omit<z.infer<typeof receivableCommandSchema>["payload"], "idempotencyKey">,
  idFactory: () => string = defaultId,
) {
  const effectId = idFactory();
  return attempt({
    schemaVersion: 1,
    requestId: `mobile-receivable-request:${effectId}`,
    type: "RECORD_RECEIVABLE",
    payload: { ...input, idempotencyKey: `mobile-receivable:${effectId}` },
  });
}

export function createPaymentAttempt(
  input: Omit<z.infer<typeof paymentCommandSchema>["payload"], "eventId">,
  idFactory: () => string = defaultId,
) {
  const effectId = idFactory();
  return attempt({
    schemaVersion: 1,
    requestId: `mobile-payment-request:${effectId}`,
    type: "RECORD_PAYMENT",
    payload: { ...input, eventId: `mobile-payment:${effectId}` },
  });
}

export function createFollowUpAttempt(
  input: Omit<z.infer<typeof followUpCommandSchema>["payload"], "idempotencyKey">,
  idFactory: () => string = defaultId,
) {
  const effectId = idFactory();
  return attempt({
    schemaVersion: 1,
    requestId: `mobile-follow-up-request:${effectId}`,
    type: "SCHEDULE_FOLLOW_UP",
    payload: { ...input, idempotencyKey: `mobile-follow-up:${effectId}` },
  });
}

export function assertCommandAllowed(workspace: MobileWorkspace, command: MobileCommand) {
  const allowed =
    command.type === "SCHEDULE_FOLLOW_UP"
      ? workspace.permissions.canScheduleFollowUps
      : workspace.permissions.canManageReceivables;
  if (!allowed) throw new Error("MOBILE_COMMAND_PERMISSION_REFUSED");
  if (command.payload.workspaceId !== workspace.id) {
    throw new Error("MOBILE_COMMAND_WORKSPACE_REFUSED");
  }
}

export function beginAttempt(value: CommandAttempt): CommandAttempt {
  if (value.state !== "READY" && value.state !== "OUTCOME_UNKNOWN") {
    throw new Error("MOBILE_COMMAND_ALREADY_DISPATCHED");
  }
  return Object.freeze({ ...value, state: "SENDING", publicError: null });
}

export function finishAttempt(
  value: CommandAttempt,
  state: Exclude<AttemptState, "READY" | "SENDING">,
  publicError: string | null = null,
): CommandAttempt {
  if (value.state !== "SENDING") throw new Error("MOBILE_COMMAND_NOT_SENDING");
  return Object.freeze({ ...value, state, publicError });
}
