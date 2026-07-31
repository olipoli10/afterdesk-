import { describe, expect, it } from "vitest";
import { resolveConfidence } from "@/lib/pricing-ai";

describe("resolveConfidence — the hard floor", () => {
  it("forces low when there is zero reference precedent, no matter what the model claims", () => {
    expect(resolveConfidence("high", 0)).toBe("low");
    expect(resolveConfidence("medium", 0)).toBe("low");
    expect(resolveConfidence("low", 0)).toBe("low");
  });

  it("passes the model's stated confidence through when precedent exists", () => {
    expect(resolveConfidence("high", 5)).toBe("high");
    expect(resolveConfidence("medium", 2)).toBe("medium");
    expect(resolveConfidence("low", 1)).toBe("low");
  });

  it("floors to low on a missing or malformed model value, even with precedent — never defaults up", () => {
    expect(resolveConfidence(undefined, 5)).toBe("low");
    expect(resolveConfidence(null, 5)).toBe("low");
    expect(resolveConfidence("very confident", 5)).toBe("low");
    expect(resolveConfidence(0.9, 5)).toBe("low");
  });
});
