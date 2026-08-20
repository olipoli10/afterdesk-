"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/authz";
import {
  StaleGatewayBreakerGenerationError,
  transitionGatewayBreaker,
  type GatewayBreakerScopeKind,
} from "@/server/model-gateway/breakers";

const breakerActionSchema = z.object({
  scopeKind: z.enum(["policy", "route", "model", "provider"]),
  scopeKey: z.string().trim().min(1).max(240).regex(/^[A-Za-z0-9_.:@-]+$/),
  expectedGeneration: z.string().regex(/^\d+$/).transform((value) => BigInt(value)),
  nextState: z.enum(["closed", "open"]),
  reasonClass: z.enum(["operator_stop", "operator_reset", "certification_revoked", "spend_protection"]),
});

export type AdminModelGatewayResult =
  | { ok: true; scopeKind: GatewayBreakerScopeKind; scopeKey: string; generation: string; state: "closed" | "open" }
  | { ok: false; code: "invalid_request" | "stale_generation" };

/**
 * The authorization is deliberately at this mutation boundary. A future
 * admin UI may hide controls, but that UI is not the security boundary.
 */
export async function transitionModelGatewayBreaker(input: unknown): Promise<AdminModelGatewayResult> {
  const admin = await requireRole("ADMIN");
  const parsed = breakerActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_request" };
  try {
    const result = await transitionGatewayBreaker({
      scope: { scopeKind: parsed.data.scopeKind, scopeKey: parsed.data.scopeKey },
      expectedGeneration: parsed.data.expectedGeneration,
      nextState: parsed.data.nextState,
      reasonClass: parsed.data.reasonClass,
      actorId: admin.id,
    });
    revalidatePath("/admin/reliability");
    return {
      ok: true,
      scopeKind: result.scopeKind,
      scopeKey: result.scopeKey,
      generation: result.generation.toString(),
      state: result.state,
    };
  } catch (error) {
    if (error instanceof StaleGatewayBreakerGenerationError) {
      return { ok: false, code: "stale_generation" };
    }
    throw error;
  }
}
