import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Money field names that must never appear in an audit payload. */
const REDACTED_KEYS = new Set([
  "clientPriceCents",
  "vaPayoutCents",
  "amountCents",
  "aiLowCents",
  "aiHighCents",
]);

/**
 * Strips raw money values from an audit payload, keeping the field name so the
 * record still shows WHAT changed. AdminEvent rows outlive the entities they
 * describe and are read in bulk — a price sitting in one is a RULE 2 leak with
 * a long half-life.
 */
function redact(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object") return value as Prisma.InputJsonValue;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACTED_KEYS.has(k) ? "[redacted]" : v;
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
