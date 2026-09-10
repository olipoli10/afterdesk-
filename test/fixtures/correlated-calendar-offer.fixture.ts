import { createHash } from "node:crypto";
import { correlatedReceiptFixture } from "./personal-correlated-receipt.fixture";
import { buildCorrelatedCalendarReferenceProof } from "@/server/model-gateway/personal-intent/correlated-calendar-proof";
import { fingerprintCorrelatedCalendarApprovalView } from "@/server/personal-assistant/correlated-calendar-approval-contract";
import { PERSONAL_MODEL_AUTHORITY } from "@/server/model-gateway/personal-intent/budget-policy";

/** Synthetic producer-derived texts/metadata. The gate/DB remain test doubles;
 * these values never certify persisted sources or real provider authority. */
export function correlatedCalendarOfferFixture() {
  const f = correlatedReceiptFixture();
  if (f.packet.status !== "RESOLVED_NOT_AUTHORIZED") throw new Error("OFFER_FIXTURE_RESOLUTION_REQUIRED");
  const ref = buildCorrelatedCalendarReferenceProof(f.durable, { packet: f.packet, packetHash: f.packetHash });
  const now = "2026-09-11T04:02:00.000Z", expiry = "2026-09-11T04:08:00.000Z";
  const request = { ...ref.proof.draft, accountVersion: 1, requestId: ref.requestId };
  const hash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const descriptor = fingerprintCorrelatedCalendarApprovalView({ version: "personal-correlated-calendar-approval-view-v1", scope: { userId: "owner", workspaceId: "workspace" },
    review: { reviewId: "review", receiptId: "receipt", reviewVersion: "personal-sms-correlated-calendar-review-v1", packetHash: ref.packetHash, proofHash: ref.proofHash },
    request: { calendarRequestId: request.requestId, calendarRequestHash: hash, connectorAccountId: "calendar", accountVersion: 1 },
    presentation: { itemVersion: "personal-correlated-calendar-review-v1", evidenceVersion: "personal-correlated-calendar-local-preview-v1", titleNormalization: "EXISTING_SCHEMA_TRIM_ONLY", provenance: "UNKNOWN" } });
  const review = { version: "personal-correlated-calendar-review-v1", reviewId: "review", inspectedAt: now, preparedAt: "2026-09-11T04:01:02.000Z", preparationExpiresAt: expiry,
    currentStatus: "pending", readOnly: true, approvalAvailable: false, executionAuthorized: false, semanticInterpretationVerified: false,
    evidence: { version: "personal-correlated-calendar-local-preview-v1", approvalAvailable: false, provenance: "UNKNOWN",
      sources: f.packet.sources.map((s, i) => ({ role: i === 0 ? "ORIGINAL_REQUEST" : "CLARIFICATION_REPLY", operationId: s.operationId, requestHash: s.requestHash, text: s.body, receivedAt: s.receivedAt })),
      citations: f.packet.citations, anchorReceivedAt: f.packet.anchorReceivedAt, clarifiedSlot: f.packet.evidence.slot, draft: ref.proof.draft } };
  const gate = { status: "CORRELATED_CALENDAR_APPROVAL_GATE_INSPECTED", committed: false, executionAuthorized: false, persistencePerformed: false, providerCallPerformed: false,
    actor: { userId: "owner", workspaceId: "workspace" }, operationId: "private-calendar-operation", view: descriptor.view, fingerprint: descriptor.fingerprint,
    request, review, inspectedAt: now, approvalExpiresAt: expiry, authority: { credentialId: "private-credential" }, readPrerequisite: { readGrantId: "private-grant" } };
  const dto = { version: "personal-correlated-calendar-approval-offer-v1", workspaceId: "workspace", readOnly: true, executionAuthorized: false, explicitApprovalRequired: true, review,
    approvalOffer: { status: "ELIGIBLE_FOR_EXPLICIT_APPROVAL", reviewId: "review", expectedRequestHash: hash, expectedReviewFingerprint: descriptor.fingerprint,
      fingerprintVersion: "personal-correlated-calendar-approval-view-v1", inspectedAt: now, approvalExpiresAt: expiry, executionAuthorized: false } };
  const env: Record<string, string> = { ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_APPROVAL_ENABLED: "true", ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED: "true",
    ENDVERA_SMS_TEMPORAL_CLARIFICATION_STORE_ENABLED: "true", ENDVERA_EXTERNAL_TRANSPORT_ENABLED: "ENABLED", ENDVERA_EXTERNAL_AUTHORITY_REF: PERSONAL_MODEL_AUTHORITY,
    ENDVERA_EXTERNAL_OWNER_REF: "synthetic", ENDVERA_GOOGLE_OAUTH_ENABLED: "ENABLED", GOOGLE_CLIENT_ID: "synthetic", GOOGLE_CLIENT_SECRET: "synthetic",
    GOOGLE_REDIRECT_URI: "https://endvera.example/api/endvera/v1/personal/google/callback", BETTER_AUTH_URL: "https://endvera.example", ENDVERA_PERSONAL_PILOT_EXPIRES_AT: "2026-10-10T01:18:26Z" };
  return structuredClone({ gate, dto, now, expiry, env, input: { enabled: true, actor: { userId: "owner", workspaceId: "workspace" }, reviewId: "review" } });
}
