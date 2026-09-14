import { beforeEach, describe, expect, it, vi } from "vitest";

const shared = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock("@/server/personal-assistant/api-auth", () => ({ personalApiUser: shared.auth }));
vi.mock("@/server/personal-assistant/device-bridge", () => ({
  claimDeviceCalendarDirective: vi.fn(),
  personalDeviceStatus: vi.fn(),
  recordDeviceCalendarReceipt: vi.fn(),
  registerPersonalAndroidDevice: vi.fn(),
  revokePersonalAndroidDevice: vi.fn(),
}));

import { GET, POST } from "@/app/api/endvera/v1/mobile/device-bridge/route";

const ratePolicy = { namespace: "personal-device-bridge", window: 60, max: 60 };

beforeEach(() => {
  vi.clearAllMocks();
  shared.auth.mockResolvedValue({ response: Response.json({ error: "stop" }, { status: 401 }) });
});

describe("personal device bridge rate isolation", () => {
  it.each([
    ["GET", GET],
    ["POST", POST],
  ] as const)("uses its dedicated authenticated budget for %s", async (_method, handler) => {
    const request = new Request("https://endvera.example/api/endvera/v1/mobile/device-bridge", { method: _method });
    expect((await handler(request)).status).toBe(401);
    expect(shared.auth).toHaveBeenCalledExactlyOnceWith(request, ratePolicy);
  });
});
