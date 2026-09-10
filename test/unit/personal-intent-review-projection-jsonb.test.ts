import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { personalModelReviewsForOwner } from "@/server/model-gateway/personal-intent/review-projection";
const shared = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: shared.transaction } }));
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

beforeEach(() => vi.clearAllMocks());
describe("review projection storage-order equivalence", () => {
  it.each(["sms", "voice", "calendar"].flatMap(kind => ["unchanged", "unknown-field", "coerced-field", "whitespace-change"].map(change => ({ kind, change }))))("checks $kind / $change without weakening original hash integrity", async ({ kind, change }) => {
    const envelope = { accountSid: "ACsynthetic", messageSid: "SMsynthetic", from: "+15145550122", to: "+15145550111", body: "Une demande synthétique." };
    const visible = kind === "calendar"
      ? { title: "Chantier synthétique", startsAt: "2026-09-11T14:00:00Z", endsAt: "2026-09-11T15:00:00Z", timezone: "America/Toronto" }
      : { to: envelope.from, from: envelope.to, text: "Bonjour" };
    const ordered = kind === "calendar" ? { ...visible, accountVersion: 3, requestId: "bbfdd239-f574-4bc7-80b9-6da86f0f7777" } : visible;
    // JSONB's physical key ordering is not JavaScript's insertion ordering.
    const stored = Object.fromEntries(Object.entries(ordered).reverse());
    expect(hash(stored)).not.toBe(hash(ordered));
    if (change === "unknown-field") stored.execute = true;
    if (change === "coerced-field") stored[kind === "calendar" ? "accountVersion" : "text"] = kind === "calendar" ? "3" : 123;
    if (change === "whitespace-change") {
      const key = kind === "calendar" ? "title" : "text";
      stored[key] = ` ${stored[key]} `;
    }
    const actionKind = kind === "calendar" ? "PREPARE_CALENDAR_EVENT" : kind === "voice" ? "PREPARE_SELF_CALL" : "PREPARE_SELF_SMS";
    const draftKind = kind === "calendar" ? "calendar_write" : kind === "voice" ? "voice_outbound" : "sms_outbound";
    const review = { status: "REVIEW_PREPARED_NOT_AUTHORIZED", executionAuthorized: false, externalTransportPerformed: false,
      accounting: "UNSETTLED", automaticRetry: false, semanticIntentVerified: false, modelChildOperationId: "child",
      source: { operationId: "source", text: envelope.body, receivedAt: "2026-09-10T14:00:00Z", timezone: "America/Toronto" },
      actions: [{ actionId: "a", kind: actionKind, status: "PREPARED_UNSENT", operationId: "draft", requestHash: hash(ordered), draft: visible }] };
    const source = { id: "source", request: Object.fromEntries(Object.entries(envelope).reverse()), requestHash: hash(envelope),
      result: { personalModelReview: review }, createdAt: new Date(review.source.receivedAt), modelChildOperationId: "child" };
    shared.transaction.mockImplementation(fn => fn({ $queryRawUnsafe: vi.fn(async (sql: string) => sql.includes("SELECT w.id") ? [{ id: "workspace" }] : [source]),
      personalSmsCorrelatedCalendarReview: { findMany: vi.fn(async () => []) },
      personalAssistantOperation: { findMany: vi.fn(async () => [{ id: "draft", kind: draftKind, status: "pending", request: stored, requestHash: hash(ordered) }]) } }));
    const result = await personalModelReviewsForOwner("owner", "workspace");
    if (change === "unchanged") expect(result.reviews[0].actions[0]).toMatchObject({ currentStatus: "pending", nextDecision: "REVIEW_EXACT_DRAFT", operationId: "draft", requestHash: hash(ordered) });
    else {
      expect(result.reviews[0].actions[0]).toMatchObject({ currentStatus: "UNAVAILABLE_OR_CHANGED", nextDecision: "MANUAL_REVIEW" });
      expect(result.reviews[0].actions[0]).not.toHaveProperty("operationId");
      expect(result.reviews[0].actions[0]).not.toHaveProperty("requestHash");
    }
  });
});
