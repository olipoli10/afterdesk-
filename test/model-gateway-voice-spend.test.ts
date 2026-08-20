import { describe, expect, it } from "vitest";
import { checkVoiceSessionSpendHeadroom } from "@/server/model-gateway/voice/dispatch";

describe("voice session spend headroom", () => {
  it("counts held, settled and uncertain exposure conservatively", () => {
    expect(checkVoiceSessionSpendHeadroom({
      sessionCeilingMicros: 100n,
      holds: [
        { status: "held", amountMicros: 40n, settledMicros: null },
        { status: "settled", amountMicros: 50n, settledMicros: 20n },
        { status: "released", amountMicros: 90n, settledMicros: 0n },
      ],
      requestedMicros: 40n,
    })).toEqual({ allowed: true, committedMicros: 60n, remainingMicros: 40n });
  });

  it("refuses an overflow and never treats unknown held cost as zero", () => {
    expect(checkVoiceSessionSpendHeadroom({
      sessionCeilingMicros: 100n,
      holds: [{ status: "held", amountMicros: 80n, settledMicros: null }],
      requestedMicros: 21n,
    })).toEqual({ allowed: false, committedMicros: 80n, remainingMicros: 20n });
  });

  it("refuses already-over-ceiling holds when the current hold is included", () => {
    expect(checkVoiceSessionSpendHeadroom({
      sessionCeilingMicros: 100n,
      holds: [
        { status: "held", amountMicros: 80n, settledMicros: null },
        { status: "held", amountMicros: 30n, settledMicros: null },
      ],
      requestedMicros: 0n,
    })).toEqual({ allowed: false, committedMicros: 110n, remainingMicros: 0n });
  });
});
