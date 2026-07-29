import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Money field names that must never appear in an audit payload. Matched
 * case-insensitively on the whole key, plus any key ending in "cents" or
 * "price" — new money columns are added over time and a redactor that only
 * knows today's names silently stops protecting.
 */
const REDACTED_KEYS = new Set([
  "clientpricecents",
  "vapayoutcents",
  "amountcents",
  "ailowcents",
  "aihighcents",
  "partialrefundcents",
  "refundedcents",
]);

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return REDACTED_KEYS.has(k) || k.endsWith("cents") || k.endsWith("price");
}

/**
 * Strips raw money values from an audit payload, keeping the field name so the
 * record still shows WHAT changed. AdminEvent rows outlive the entities they
 * describe and are read in bulk — a price sitting in one is a RULE 2 leak with
 * a long half-life.
 *
 * Walks the whole structure: a one-level pass misses `{ before: { task: {
 * clientPriceCents } } }` entirely, and turns an array into an object with
 * numeric keys.
 */
function redact(value: unknown, depth = 0): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) return undefined;
  if (depth > 6) return "[too deep]";
  if (typeof value !== "object") return value as Prisma.InputJsonValue;

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1) ?? null) as Prisma.InputJsonValue;
  }
  if (value instanceof Date) return value.toISOString();

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? "[redacted]" : (redact(v, depth + 1) ?? null);
  }
  return out as Prisma.InputJsonValue;
}

/**
 * User- and settings-level audit. Separate from TaskEvent, which is task-scoped
 * and cascades on delete; this must survive the thing it describes.
 */
export async function logAdminEvent(entry: {
  actorId: string;
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await prisma.adminEvent.create({
    data: {
      actorId: entry.actorId,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      before: redact(entry.before),
      after: redact(entry.after),
    },
  });
}
