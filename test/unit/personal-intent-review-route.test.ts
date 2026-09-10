import { beforeEach, describe, expect, it, vi } from "vitest";
import * as route from "@/app/api/endvera/v1/personal/model/reviews/route";
const shared = vi.hoisted(() => ({ auth: vi.fn(), project: vi.fn() }));
vi.mock("@/server/personal-assistant/api-auth", () => ({ personalApiUser: shared.auth }));
vi.mock("@/server/model-gateway/personal-intent/review-projection", () => ({ personalModelReviewsForOwner: shared.project }));
beforeEach(() => { vi.clearAllMocks(); shared.auth.mockResolvedValue({ user: { id: "owner" } }); shared.project.mockResolvedValue({ reviews: [], readOnly: true }); });
describe("personal model reviews GET route", () => {
  it("has no write/approval/dispatch methods", () => { expect(Object.keys(route).sort()).toEqual(["GET", "runtime"]); });
  it("uses authenticated actor and prevents cache reuse", async () => {
    const response = await route.GET(new Request("https://local.example/api/endvera/v1/personal/model/reviews?workspaceId=workspace"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie, Authorization"); expect(shared.project).toHaveBeenCalledWith("owner", "workspace");
  });
  it("returns authentication rejection without loading source text", async () => {
    shared.auth.mockResolvedValue({ response: Response.json({ error: "login" }, { status: 401 }) });
    const response = await route.GET(new Request("https://local.example/?workspaceId=workspace"));
    expect(response.status).toBe(401); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(shared.project).not.toHaveBeenCalled();
  });
  it.each(["", "?workspaceId=", "?workspaceId=a&workspaceId=b", "?workspaceId=a&userId=other", `?workspaceId=${"x".repeat(129)}`])("refuses invalid query %s", async query => {
    expect((await route.GET(new Request(`https://local.example/${query}`))).status).toBe(400); expect(shared.project).not.toHaveBeenCalled();
  });
  it("does not disclose database errors", async () => {
    shared.project.mockRejectedValue(new Error("private detail")); const response = await route.GET(new Request("https://local.example/?workspaceId=workspace"));
    expect(response.status).toBe(403); expect(await response.text()).not.toContain("private detail");
  });
});
