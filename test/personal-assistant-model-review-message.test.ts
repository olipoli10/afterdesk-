import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createPersonalIntentInput } from "@/server/model-gateway/personal-intent/contract";
const m = vi.hoisted(() => ({ unexpected: vi.fn(() => { throw new Error("UNEXPECTED_PRODUCT_CALL"); }) }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRawUnsafe: m.unexpected } }));
vi.mock("@/server/model-gateway/personal-intent/configuration", () => ({ loadPersonalModelConfiguration: m.unexpected }));
vi.mock("@/server/model-gateway/personal-intent/admission", () => ({ admitPersonalIntent: m.unexpected }));
vi.mock("@/server/model-gateway/personal-intent/dispatch", () => ({ dispatchPersonalIntent: m.unexpected }));
vi.mock("@/server/model-gateway/personal-intent/openrouter-adapter", () => ({ createOpenRouterPersonalIntentAdapter: m.unexpected }));
vi.mock("@/server/model-gateway/personal-intent/openrouter-transport", () => ({ createPersonalOpenRouterTransport: m.unexpected }));
vi.mock("@/server/personal-assistant/model-connection", () => ({ personalModelCredentialForDispatch: m.unexpected }));
vi.mock("@/server/model-gateway/personal-intent/review-consumer", () => ({ prepareStoredPersonalIntentReview: m.unexpected }));
import { personalModelReviewReply } from "@/server/personal-assistant/model-worker";
import { formatPersonalModelReviewMessage as format, PERSONAL_MODEL_REVIEW_MESSAGE_VERSION } from "@/server/personal-assistant/model-review-message";
import { prepareSmsTemporalClarification as prepare, smsTemporalClarificationQuestionRequest as request, markSmsTemporalClarificationAsked as asked } from "@/server/personal-assistant/sms-temporal-clarification";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const anchor = "2026-09-10T12:00:00.000Z";
const prefix = "Ta demande est conservée dans ENDVERA.";
const footer = "Aucun rendez-vous modifié ni message/appel exécuté par ces propositions.";
function fixture(reason: "AMBIGUOUS_TIME" | "MISSING_END_TIME") {
  const envelope = { accountSid: "AC" + "1".repeat(32), messageSid: "SM" + "2".repeat(32), from: "+14185550101", to: "+14185550102", body: "Ajoute visite demain à 2h." };
  const input = createPersonalIntentInput("source", envelope.body);
  return prepare({ schemaVersion: 1, clarificationId: "d16683b9-865c-4ff8-a9f6-69e6e99a9191", actionId: "event", modelChildOperationId: "child", modelGatewayOperationId: "gateway",
    createdAt: anchor, expiresAt: "2026-09-10T12:10:00.000Z",
    source: { ...envelope, requestHash: sha(JSON.stringify(envelope)), receivedAt: anchor, operationId: "source", workspaceId: "workspace", userId: "owner", identityId: "identity", verifiedIngress: true },
    rawProposal: JSON.stringify({ schemaVersion: 1, requestFingerprint: input.requestFingerprint, actions: [{ id: "event", dependsOn: [], kind: "CLARIFY", reason }] }),
    binding: { workspaceId: "workspace", userId: "owner", memberId: "member", memberRole: "owner", memberRevision: anchor, workspaceRevision: anchor,
      identityId: "identity", identityRevision: anchor, verifiedIdentity: true, ownerNumber: envelope.from, endveraNumber: envelope.to,
      smsAccountId: "sms", smsAccountVersion: 1, smsAccountKeyHash: sha(envelope.accountSid), smsInboundGrantId: "inbound", smsInboundGrantVersion: 1,
      modelAccountId: "model", modelAccountVersion: 1, modelGrantId: "model-grant", modelGrantVersion: 1,
      calendarAccountId: "calendar", calendarAccountVersion: 1, calendarWriteGrantId: "write", calendarWriteGrantVersion: 1, timezone: "America/Toronto" } });
}
describe("one existing full review wire formatter, no outbox authority bypass", () => {
  it.each(["AMBIGUOUS_TIME", "MISSING_END_TIME"] as const)("binds byte-identical actual worker/request text for %s", reason => {
    const p = fixture(reason);
    const review: Parameters<typeof personalModelReviewReply>[0] = { status: "REVIEW_PREPARED_NOT_AUTHORIZED", executionAuthorized: false,
      externalTransportPerformed: false, accounting: "UNSETTLED", automaticRetry: false, semanticIntentVerified: false,
      source: { operationId: p.source.operationId, text: p.source.body, receivedAt: anchor, timezone: p.binding.timezone }, modelChildOperationId: "child",
      actions: [{ actionId: "event", kind: "CLARIFY", status: "CLARIFY", question: p.question }] };
    const actualWorkerReply = personalModelReviewReply(review);
    expect(actualWorkerReply).toBe(`${prefix}\n${p.question}\n${footer}`);
    expect(request(p).text).toBe(actualWorkerReply); expect(p.wireText).toBe(actualWorkerReply);
    expect(p.wireTextHash).toBe(sha(actualWorkerReply)); expect(p.wireFormatterVersion).toBe(PERSONAL_MODEL_REVIEW_MESSAGE_VERSION);
    expect(p.question).not.toContain(prefix); expect(m.unexpected).not.toHaveBeenCalled();
  });
  it("preserves exact legacy prepared/read/question ordering and blank filtering", () => {
    expect(format({ status: "REVIEW_PREPARED_NOT_AUTHORIZED", actions: [{ status: "PREPARED_UNSENT" }, { status: "PREPARED_UNSENT" },
      { status: "READ_REVIEW_ONLY" }, { status: "CLARIFY", question: "Question un?" }, { status: "CLARIFY" }, { status: "CLARIFY", question: "Question deux?" }] }))
      .toBe("2 action(s) préparée(s) dans ENDVERA. Lis ta demande originale et les détails avant d’approuver dans l’app.\nLa période de calendrier est identifiée, mais Google Agenda n’a pas été consulté par cette analyse.\nQuestion un?\nQuestion deux?\n" + footer);
    expect(format({ status: "REVIEW_PREPARED_NOT_AUTHORIZED", actions: [] })).toBe(prefix + "\n" + footer);
    expect(() => personalModelReviewReply({ status: "DISABLED", executionAuthorized: false })).toThrow("PERSONAL_MODEL_REVIEW_DISABLED");
  });
  it.each(["wireText", "wireTextHash", "wireFormatterVersion"] as const)("refuses modified immutable %s", key => {
    const p = fixture("MISSING_END_TIME");
    expect(() => request({ ...p, [key]: key === "wireTextHash" ? "0".repeat(64) : "changed" } as never)).toThrow();
  });
  it("refuses a former question-only hash as an accepted full-wire receipt", () => {
    const p = fixture("AMBIGUOUS_TIME");
    const oldRequest = { ...request(p), text: p.question };
    expect(() => asked(p, { outboundOperationId: "outbound", requestHash: sha(JSON.stringify(oldRequest)), acceptedProviderSid: "SM" + "3".repeat(32),
      acceptedAt: anchor, acceptedByProvider: true, deliveryConfirmed: false }, anchor)).toThrow("RECEIPT_INVALID");
  });
});
