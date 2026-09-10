import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/server/model-gateway/evidence";
import { personalCorrelatedCalendarRequestId } from "@/server/model-gateway/personal-intent/correlated-calendar-id";
import { GOOGLE_CALENDAR_WRITE_SCOPE } from "@/lib/construction-operating-assistant-r3/connector-contracts";
import { fingerprintCorrelatedCalendarApprovalView as fingerprint, inspectCorrelatedCalendarApprovalCommand as inspectCommand,
  inspectCorrelatedCalendarApprovalClaim as inspectClaim, inspectCorrelatedCalendarApprovalState as inspectState,
  CORRELATED_CALENDAR_APPROVAL_VIEW_VERSION as VIEW, CORRELATED_CALENDAR_APPROVAL_COMMAND_VERSION as COMMAND,
  CORRELATED_CALENDAR_APPROVAL_CLAIM_VERSION as CLAIM, CORRELATED_CALENDAR_APPROVAL_STATE_VERSION as STATE,
} from "@/server/personal-assistant/correlated-calendar-approval-contract";

function fixture() {
  const request = { title: "Révision 🛠", startsAt: "2026-09-11T18:00:00.000Z", endsAt: "2026-09-11T19:00:00.000Z",
    timezone: "America/Toronto", accountVersion: 1, requestId: personalCorrelatedCalendarRequestId("receipt-peer") };
  const requestHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  const view = { version: VIEW, scope: { userId: "owner", workspaceId: "workspace" },
    review: { reviewId: "review-peer", receiptId: "receipt-peer", reviewVersion: "personal-sms-correlated-calendar-review-v1", packetHash: "a".repeat(64), proofHash: "b".repeat(64) },
    request: { calendarRequestId: request.requestId, calendarRequestHash: requestHash, connectorAccountId: "google", accountVersion: 1 },
    presentation: { itemVersion: "personal-correlated-calendar-review-v1", evidenceVersion: "personal-correlated-calendar-local-preview-v1", titleNormalization: "EXISTING_SCHEMA_TRIM_ONLY", provenance: "UNKNOWN" } };
  const fp = fingerprint(view).fingerprint;
  const command = { version: COMMAND, workspaceId: "workspace", reviewId: "review-peer", expectedRequestHash: requestHash, expectedReviewFingerprint: fp };
  const claim = { version: CLAIM, origin: { kind: "personal_sms_temporal_receipt", approvalId: "41e663b6-e49c-4ebf-86f7-cdb1529b9f1b", reviewId: "review-peer", reviewFingerprint: fp },
    userId: "owner", workspaceId: "workspace", operationId: "operation-peer", expectedRequestHash: requestHash, request,
    authority: { accountId: "google", accountVersion: 1, credentialId: "credential", writeGrantId: "write", writeGrantVersion: 1, memberId: "member", memberRole: "owner",
      memberUpdatedAt: "2026-09-10T13:00:00.000Z", workspaceUpdatedAt: "2026-09-10T13:00:00.000Z", accountScopes: [GOOGLE_CALENDAR_WRITE_SCOPE], grantScopes: [GOOGLE_CALENDAR_WRITE_SCOPE] },
    approvalToken: "54f2bd33-60a2-4843-98b2-9cfd80f1c63a", approvedAt: "2026-09-10T14:00:00.000Z", approvalExpiresAt: "2026-09-10T14:05:00.000Z", leaseUntil: "2026-09-10T14:00:25.000Z" };
  const state = { version: STATE, origin: { ...claim.origin }, phase: "CLAIMED", approvedBy: claim.userId, approvedHash: requestHash,
    approvalToken: claim.approvalToken, writeAuthority: structuredClone(claim.authority), dispatchStarted: false };
  return { view, command, claim, state };
}
function extra(target: object, mode: "parse" | "descriptor") {
  const payload: unknown = mode === "parse" ? JSON.parse('{"__proto__":{"unexpected":"must-refuse"}}') : null;
  if (payload) Object.defineProperties(target, Object.getOwnPropertyDescriptors(payload));
  else Object.defineProperty(target, "__proto__", { value: "unexpected", enumerable: true, configurable: true });
  expect(Object.hasOwn(target, "__proto__")).toBe(true); expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
}

describe("independent typed approval pure boundary", () => {
  it("valid fixture passes all four actual inspectors before hostile extras", () => {
    const f = fixture(); expect(inspectCommand(f.command, f.view).authorityVerified).toBe(false);
    expect(inspectClaim(f.claim, f.view).claim.operationId).toBe("operation-peer");
    expect(inspectState(f.state, f.claim, f.view).state.phase).toBe("CLAIMED");
  });
  it("existing canonical serializer drops an own __proto__ key; boundary must reject before calling it", () => {
    const plain = { field: "value" }; extra(plain, "parse");
    expect(canonicalJson(plain)).toBe('{"field":"value"}');
    expect(Object.prototype).not.toHaveProperty("unexpected");
  });
  it.each(["parse", "descriptor"] as const)("rejects %s root view extra before canonical shape validation", mode => {
    const f = fixture(); extra(f.view, mode); expect(() => fingerprint(f.view)).toThrow();
  });
  it.each(["parse", "descriptor"] as const)("rejects %s nested view scope extra", mode => {
    const f = fixture(); extra(f.view.scope, mode); expect(() => fingerprint(f.view)).toThrow();
  });
  it.each(["parse", "descriptor"] as const)("rejects %s command root extra", mode => {
    const f = fixture(); extra(f.command, mode); expect(() => inspectCommand(f.command, f.view)).toThrow();
  });
  it.each(["parse", "descriptor"] as const)("rejects %s claim root extra", mode => {
    const f = fixture(); extra(f.claim, mode); expect(() => inspectClaim(f.claim, f.view)).toThrow();
  });
  it.each(["parse", "descriptor"] as const)("rejects %s claim origin extra", mode => {
    const f = fixture(); extra(f.claim.origin, mode); expect(() => inspectClaim(f.claim, f.view)).toThrow();
  });
  it.each(["parse", "descriptor"] as const)("rejects %s state origin extra", mode => {
    const f = fixture(); extra(f.state.origin, mode); expect(() => inspectState(f.state, f.claim, f.view)).toThrow();
  });
});
