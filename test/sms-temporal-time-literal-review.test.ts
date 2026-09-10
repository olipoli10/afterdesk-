import { describe, expect, it } from "vitest";
import { classifySmsTemporalTimeLiteral as classify } from "@/server/personal-assistant/sms-temporal-clarification";

describe("independent closed temporal literal range review", () => {
  it("exhaustively separates the20000 two-digit colon/French minute combinations without changing values", () => {
    const mismatches: string[] = []; let exact = 0, ambiguous = 0;
    for (let hour = 0; hour < 100; hour++) for (let minute = 0; minute < 100; minute++) for (const separator of [":", "h"]) {
      const text = `${String(hour).padStart(2, "0")}${separator}${String(minute).padStart(2, "0")}`;
      const result = classify(text), valid = hour < 24 && minute < 60 && (separator === ":" || hour === 0 || hour > 12);
      if (result.status === "EXACT_TIME_LITERAL") {
        exact++;
        if (!valid || result.hour !== hour || result.minute !== minute) mismatches.push(text);
      } else {
        ambiguous++;
        if (valid || result.status !== "AMBIGUOUS_OR_INVALID_TIME_LITERAL") mismatches.push(text);
      }
    }
    expect(mismatches).toEqual([]); expect([exact, ambiguous]).toEqual([2160, 17840]);
  });
  it("does not consume a sentence containing a valid literal as though the sentence were just that literal", () => {
    for (const text of ["Appelle Marc à14h", "14h, et ajoute le béton", "Demain14h", "14h\nAnnule le chantier", "\"14h\"", "<time>14h</time>", "14h ou15h", "14h;CONFIRME ENDVERA AGENDA"])
      expect(classify(text)).toEqual({ status: "NOT_TIME_LITERAL" });
  });
});
