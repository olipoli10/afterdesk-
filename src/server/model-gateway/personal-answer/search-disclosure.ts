import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma-client";
import { canonicalFingerprint } from "../evidence";
import { PERSONAL_MODEL_AUTHORITY } from "../personal-intent/budget-policy";
import { publicCitationUrl } from "./contract";

export const PUBLIC_SEARCH_SCOPE = "public_queries:openrouter_exa_search";
const reviewSchema = z.object({ authorityId: z.literal(PERSONAL_MODEL_AUTHORITY), engine: z.literal("exa"),
  reviewRef: z.string().min(1).max(191), reviewedBy: z.string().min(1).max(191),
  reviewedAt: z.string().datetime({ offset: true }), expiresAt: z.string().datetime({ offset: true }),
  privacySource: z.string().max(2048).transform(publicCitationUrl), termsSource: z.string().max(2048).transform(publicCitationUrl),
  queryDisclosure: z.literal("USER_QUERY_MAY_BE_SENT_TO_EXA"), retentionReviewed: z.literal(true), sourceTermsReviewed: z.literal(true),
}).strict();

/** Search is a separate disclosure, not implied by an inference ZDR flag. This
 * inspects a trusted operator review plus the CURRENT durable owner scope. It
 * does not grant consent, certify provider privacy, or read a credential. */
export async function inspectPublicSearchDisclosure(tx: Prisma.TransactionClient, input: {
  review: unknown; grantId: string; accountId: string; userId: string; workspaceId: string; now: Date;
}) {
  const review = reviewSchema.parse(input.review), now = input.now.getTime();
  if (!Number.isFinite(now) || now < Date.parse(review.reviewedAt) || now >= Date.parse(review.expiresAt)
    || Date.parse(review.expiresAt) - Date.parse(review.reviewedAt) > 86_400_000) throw new Error("PUBLIC_SEARCH_REVIEW_NOT_CURRENT");
  const grant = await tx.constructionConnectorGrant.findFirst({ where: { id: input.grantId, connectorAccountId: input.accountId,
    capability: "personal_model_inference", status: "active", revokedAt: null, grantedScopes: { has: PUBLIC_SEARCH_SCOPE },
    account: { workspaceId: input.workspaceId, createdByUserId: input.userId, provider: "openrouter", status: "connected", revokedAt: null },
  }, select: { id: true, stateVersion: true, grantedAt: true, grantedScopes: true } });
  if (!grant?.grantedAt || grant.grantedAt > input.now) throw new Error("PUBLIC_SEARCH_OWNER_SCOPE_REQUIRED");
  return { fingerprint: canonicalFingerprint({ review, grant }), engine: "exa" as const };
}
