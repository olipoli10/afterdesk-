import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/authz", () => ({ getSessionUser: deps.auth, consumeRateLimit: deps.rate }));
vi.mock("@/server/personal-assistant/correlated-calendar-approval-result", async original => ({
  ...await original<typeof import("@/server/personal-assistant/correlated-calendar-approval-result")>(), readCorrelatedCalendarApprovalResult: deps.read,
}));
import { GET } from "@/app/api/endvera/v1/personal/model/correlated-calendar-reviews/approval-result/route";

const flag = "ENDVERA_PERSONAL_SMS_CORRELATED_CALENDAR_REVIEW_ENABLED";
const url = "https://local.invalid/api/endvera/v1/personal/model/correlated-calendar-reviews/approval-result";
const user = () => ({ id: "owner", role: "CLIENT", emailVerified: true });
const dto = () => ({ version: "personal-correlated-calendar-approval-result-v1", workspaceId: "workspace", reviewId: "review-e\u0301-🛠️",
  observedAt: "2026-09-10T19:00:00.000Z", readOnly: true, approvalAvailable: false, executionAuthorized: false, automaticRetry: false,
  providerStateVerified: false, outcome: "UNKNOWN", approvedAt: "2026-09-10T18:00:00.000Z", reason: "WRITE_OUTCOME_UNKNOWN" });
const query = () => new URLSearchParams({ workspaceId: "workspace", reviewId: dto().reviewId }).toString();
const request = (suffix = query(), signal?: AbortSignal) => new Request(`${url}?${suffix}`, { signal });
async function privateReply(response: Response, status: number, body?: unknown) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie, Authorization");
  expect(response.headers.has("access-control-allow-origin")).toBe(false);
  expect(response.headers.has("set-cookie")).toBe(false);
  if (body !== undefined) expect(await response.json()).toEqual(body);
}
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv(flag, "true"); deps.auth.mockResolvedValue(user()); deps.rate.mockResolvedValue(true); deps.read.mockResolvedValue(dto()); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("C3 HTTP peer boundary — actual GET/schema/Response, fake auth and reader", () => {
  it("preserves exact NFD/surrogate query identity and opaque unknown outcome", async () => {
    await privateReply(await GET(request()), 200, dto());
    expect(deps.read.mock.calls[0][0]).toEqual({ enabled: true, actor: { workspaceId: "workspace", userId: "owner" }, reviewId: dto().reviewId });
  });
  it("does not return another normalization of the requested review", async () => {
    deps.read.mockResolvedValue({ ...dto(), reviewId: dto().reviewId.normalize("NFC") });
    await privateReply(await GET(request()), 503, { error: "Le résultat est momentanément indisponible." });
  });
  it.each(["%77orkspaceId=other", "review%49d=other", "actor%55serId=intruder"])("refuses encoded duplicate or extra parameter %s before rate/reader", async extra => {
    await privateReply(await GET(request(`${query()}&${extra}`)), 400, { error: "Dossier et demande requis." });
    expect(deps.rate).not.toHaveBeenCalled(); expect(deps.read).not.toHaveBeenCalled();
  });
  it("unauthenticated malformed query gives 401 without exposing query-validation behavior", async () => {
    deps.auth.mockResolvedValue(null);
    await privateReply(await GET(request("approvalToken=PRIVATE")), 401, { error: "Connecte-toi pour continuer." });
    expect(deps.rate).not.toHaveBeenCalled(); expect(deps.read).not.toHaveBeenCalled();
  });
  it("OFF masks auth failure and malformed query consistently", async () => {
    vi.stubEnv(flag, "false"); deps.auth.mockRejectedValue(new Error("PRIVATE_AUTH"));
    await privateReply(await GET(request("private=PRIVATE")), 404, { error: "Not found." });
    expect(deps.auth).not.toHaveBeenCalled();
  });
  it("late cancellation triggered during strict DTO parsing is checked before output", async () => {
    const abort = new AbortController(), value = dto();
    Object.defineProperty(value, "reason", { enumerable: true, get() { abort.abort(); return "WRITE_OUTCOME_UNKNOWN"; } });
    deps.read.mockResolvedValue(value);
    await privateReply(await GET(request(query(), abort.signal)), 503, { error: "Le résultat est momentanément indisponible." });
  });
  it("REVIEW withdrawn while the result is parsed produces only a private404", async () => {
    const value = dto(); Object.defineProperty(value, "reason", { enumerable: true, get() { vi.stubEnv(flag, "false"); return "WRITE_OUTCOME_UNKNOWN"; } });
    deps.read.mockResolvedValue(value);
    await privateReply(await GET(request()), 404, { error: "Not found." });
  });
  it("monotone deadline remains enforced after reader completes while wall clock rolls backwards", async () => {
    vi.spyOn(Date, "now").mockReturnValue(10000); vi.spyOn(performance, "now").mockReturnValue(1000);
    deps.read.mockImplementation(async () => { vi.mocked(Date.now).mockReturnValue(1); vi.mocked(performance.now).mockReturnValue(6000); return dto(); });
    await privateReply(await GET(request()), 503, { error: "Le résultat est momentanément indisponible." });
    expect(deps.read).toHaveBeenCalledOnce();
  });
  it.each([NaN, 999])("invalid monotone sample %s never discloses data", async value => {
    const mono = vi.spyOn(performance, "now").mockReturnValue(1000);
    deps.auth.mockImplementation(async () => { mono.mockReturnValue(value); return user(); });
    await privateReply(await GET(request()), 503); expect(deps.read).not.toHaveBeenCalled();
  });
  it("rejects a receipt with authority metadata instead of stripping and returning it", async () => {
    const result: Record<string, unknown> = { ...dto(), outcome: "CONFIRMED", confirmationBasis: "DURABLE_RECORDED_RESULT",
      receipt: { confirmed: true, providerEventId: `e${"a".repeat(31)}` } };
    delete result.reason;
    deps.read.mockResolvedValue(result); await privateReply(await GET(request()), 200);
    result.receipt = { ...(result.receipt as Record<string, unknown>), approvalToken: "PRIVATE" };
    deps.read.mockResolvedValue(result);
    await privateReply(await GET(request()), 503, { error: "Le résultat est momentanément indisponible." });
  });
  it("arbitrary thrown reader data is neither reflected nor logged by the route", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    deps.read.mockRejectedValue({ message: "PRIVATE_SQL", approvalToken: "PRIVATE_NONCE", stack: "PRIVATE_STACK" });
    await privateReply(await GET(request()), 503, { error: "Le résultat est momentanément indisponible." });
    expect(log).not.toHaveBeenCalled(); expect(deps.read).toHaveBeenCalledOnce();
  });
});
