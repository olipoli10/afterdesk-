import { createHash } from "node:crypto";
import { z } from "zod";

export const secretaryBroadcastRecipientSchema = z.object({
  contactId: z.string().trim().min(1),
  displayName: z.string().trim().min(1).max(160),
  normalizedRecipient: z.string().trim().min(1).max(64),
});

export const secretaryBroadcastPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: z.string().trim().min(1),
  draftId: z.string().trim().min(1),
  version: z.literal(1),
  channel: z.literal("SMS"),
  recipients: z.array(secretaryBroadcastRecipientSchema).min(2).max(10),
  body: z.string().trim().min(1).max(1600),
  externalTransportAuthorized: z.literal(false),
});

const broadcastDraftBaseProjectionSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["PREPARED_UNSENT", "APPROVED_UNSENT"]),
  version: z.literal(1),
  recipientCount: z.number().int().min(2).max(10),
  preparedAt: z.string().datetime(),
  externalTransportPerformed: z.literal(false),
});

export const secretaryBroadcastFullProjectionSchema = broadcastDraftBaseProjectionSchema.extend({
  visibility: z.literal("FULL"),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/u),
  body: z.string().min(1).max(1600),
  recipients: z.array(z.object({
    displayName: z.string().min(1),
    maskedDestination: z.string().min(1),
  }).strict()).min(2).max(10),
}).strict();

export const secretaryBroadcastRedactedProjectionSchema = broadcastDraftBaseProjectionSchema.extend({
  visibility: z.literal("REDACTED"),
}).strict();

export const secretaryBroadcastCockpitSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: z.string().min(1),
  role: z.enum(["owner", "admin", "field_worker"]),
  drafts: z.array(z.discriminatedUnion("visibility", [
    secretaryBroadcastFullProjectionSchema,
    secretaryBroadcastRedactedProjectionSchema,
  ])),
  externalTransportEnabled: z.literal(false),
}).strict().superRefine((value, context) => {
  if (value.role === "field_worker" && value.drafts.some((draft) => draft.visibility !== "REDACTED")) {
    context.addIssue({ code: "custom", path: ["drafts"], message: "R38E_FIELD_WORKER_DETAILS_FORBIDDEN" });
  }
  if (value.role !== "field_worker" && value.drafts.some((draft) => draft.visibility !== "FULL")) {
    context.addIssue({ code: "custom", path: ["drafts"], message: "R38E_MANAGER_DETAILS_REQUIRED" });
  }
});

export function maskSecretaryBroadcastDestination(value: string): string {
  const digits = value.replace(/\D/gu, "");
  const suffix = digits.slice(-4);
  return suffix ? `••• ••• ${suffix}` : "•••";
}

export type SecretaryBroadcastParseResult =
  | { kind: "NOT_BROADCAST" }
  | { kind: "CANDIDATE"; recipientNames: string[]; body: string }
  | {
      kind: "REFUSED";
      reasonCode:
        | "R38E_MESSAGE_REQUIRED"
        | "R38E_DUPLICATE_RECIPIENT"
        | "R38E_TOO_MANY_RECIPIENTS";
    };

function normalizeForComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr-CA");
}

function parseAudience(value: string): string[] {
  return value
    .replace(/^\s*(?:à|a)\s+/iu, "")
    .split(/\s*,\s*|\s+(?:et|and)\s+/iu)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function parseSecretaryBroadcastCommand(input: string): SecretaryBroadcastParseResult {
  const command = input.trim();
  const prefix = /^(?:texte|text|envoie\s+un\s+texto(?:\s+à)?|send\s+(?:a\s+)?text\s+to)\s+/iu.exec(command);
  if (!prefix) return { kind: "NOT_BROADCAST" };

  const remainder = command.slice(prefix[0].length).trim();
  const bodyDelimiter = /\s+que\s+/iu.exec(remainder);
  const audienceText = bodyDelimiter ? remainder.slice(0, bodyDelimiter.index).trim() : remainder;
  const recipientNames = parseAudience(audienceText);

  if (recipientNames.length < 2) return { kind: "NOT_BROADCAST" };
  if (!bodyDelimiter || !remainder.slice(bodyDelimiter.index + bodyDelimiter[0].length).trim()) {
    return { kind: "REFUSED", reasonCode: "R38E_MESSAGE_REQUIRED" };
  }
  if (recipientNames.length > 10) {
    return { kind: "REFUSED", reasonCode: "R38E_TOO_MANY_RECIPIENTS" };
  }

  const normalizedNames = recipientNames.map(normalizeForComparison);
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    return { kind: "REFUSED", reasonCode: "R38E_DUPLICATE_RECIPIENT" };
  }

  return {
    kind: "CANDIDATE",
    recipientNames,
    body: remainder.slice(bodyDelimiter.index + bodyDelimiter[0].length).trim(),
  };
}

export function buildSecretaryBroadcastRequestHash(input: {
  recipientNames: string[];
  body: string;
}): string {
  const canonical = JSON.stringify({
    recipientNames: input.recipientNames.map(normalizeForComparison),
    body: input.body.trim().replace(/\s+/g, " "),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
